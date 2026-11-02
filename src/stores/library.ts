import { create } from 'zustand';

import * as DB from '@/db/database';
import type { AlbumRow, PlaylistRow, TrackRow } from '@/db/database';
import { newId, normalizeName, stableId } from '@/lib/ids';
import { sortKey } from '@/lib/format';
import { deleteRelative } from '@/lib/paths';

export type Track = TrackRow;

export type Album = {
  id: string;
  title: string;
  artist: string;
  year: number | null;
  trackIds: string[];
  duration: number;
  favorite: boolean;
  lastPlayed: number | null;
  dateAdded: number;
  customArtwork: string | null;
  embeddedArtwork: string | null;
};

export type Artist = {
  id: string;
  name: string;
  albumIds: string[];
  trackIds: string[];
};

export type Playlist = {
  id: string;
  name: string;
  trackIds: string[];
  createdAt: number;
  updatedAt: number;
  lastPlayed: number | null;
};

export const UNKNOWN_ARTIST = 'Unknown Artist';
export const UNKNOWN_ALBUM = 'Unknown Album';

export function albumIdFor(albumArtist: string, album: string): string {
  return stableId(`album|${normalizeName(albumArtist)}|${normalizeName(album)}`);
}

export function artistIdFor(name: string): string {
  return stableId(`artist|${normalizeName(name)}`);
}

type LibraryState = {
  ready: boolean;
  tracks: Record<string, Track>;
  albums: Record<string, Album>;
  artists: Record<string, Artist>;
  playlists: Record<string, Playlist>;
  /** Sorted id lists, rebuilt when the library changes. */
  songOrder: string[];
  albumOrder: string[];
  artistOrder: string[];
  playlistOrder: string[];
  /** Bumped whenever artwork changes so every surface re-resolves its image. */
  artworkVersion: number;

  hydrate(): void;
  addImported(tracks: TrackRow[], albums: AlbumRow[]): void;
  removeTracks(ids: string[]): Promise<void>;
  updateTrackInfo(id: string, info: Partial<Pick<Track, 'title' | 'artist' | 'albumArtist' | 'album' | 'trackNumber' | 'discNumber' | 'year' | 'genre'>>): Promise<void>;
  toggleFavoriteTrack(id: string): boolean;
  toggleFavoriteAlbum(id: string): boolean;
  recordPlay(trackId: string): void;
  recordPlaylistPlay(playlistId: string): void;
  setAlbumArtwork(albumId: string, relativePath: string | null): Promise<void>;
  setTrackArtwork(trackId: string, relativePath: string | null): Promise<void>;
  createPlaylist(name: string, trackIds?: string[]): Promise<string>;
  renamePlaylist(id: string, name: string): Promise<void>;
  deletePlaylist(id: string): Promise<void>;
  addToPlaylist(id: string, trackIds: string[]): Promise<void>;
  removeFromPlaylist(id: string, index: number): Promise<void>;
  movePlaylistTrack(id: string, from: number, to: number): Promise<void>;
};

type Raw = {
  tracks: Record<string, Track>;
  albumRows: Record<string, AlbumRow>;
  playlists: Record<string, Playlist>;
};

let raw: Raw = { tracks: {}, albumRows: {}, playlists: {} };

function compareTracksInAlbum(a: Track, b: Track) {
  const disc = (a.discNumber ?? 1) - (b.discNumber ?? 1);
  if (disc !== 0) return disc;
  const tn = (a.trackNumber ?? 9999) - (b.trackNumber ?? 9999);
  if (tn !== 0) return tn;
  return sortKey(a.title).localeCompare(sortKey(b.title));
}

/** Builds albums, artists and sorted lists from the raw rows. */
function derive(r: Raw) {
  const albums: Record<string, Album> = {};
  const artists: Record<string, Artist> = {};

  const visibleTracks = Object.values(r.tracks).filter((t) => !t.missing);

  for (const t of visibleTracks) {
    const row = r.albumRows[t.albumId];
    let album = albums[t.albumId];
    if (!album) {
      album = {
        id: t.albumId,
        title: row?.title ?? t.album,
        artist: row?.artist ?? t.albumArtist ?? t.artist,
        year: row?.year ?? t.year,
        trackIds: [],
        duration: 0,
        favorite: !!row?.favorite,
        lastPlayed: row?.lastPlayed ?? null,
        dateAdded: row?.dateAdded ?? t.dateAdded,
        customArtwork: row?.customArtwork ?? null,
        embeddedArtwork: null,
      };
      albums[t.albumId] = album;
    }
    album.trackIds.push(t.id);
    album.duration += t.duration;
    if (!album.year && t.year) album.year = t.year;
    if (t.dateAdded > album.dateAdded) album.dateAdded = t.dateAdded;
  }

  for (const album of Object.values(albums)) {
    album.trackIds.sort((a, b) => compareTracksInAlbum(r.tracks[a], r.tracks[b]));
    album.embeddedArtwork =
      album.trackIds.map((id) => r.tracks[id].embeddedArtwork).find((p) => !!p) ?? null;

    const artistName = album.artist || UNKNOWN_ARTIST;
    const artistId = artistIdFor(artistName);
    const artist = (artists[artistId] ??= { id: artistId, name: artistName, albumIds: [], trackIds: [] });
    artist.albumIds.push(album.id);
  }

  // Songs list under every artist who performs them (track artist and album artist).
  for (const t of visibleTracks) {
    const names = new Set([t.albumArtist || t.artist || UNKNOWN_ARTIST, t.artist || UNKNOWN_ARTIST]);
    for (const name of names) {
      const id = artistIdFor(name);
      const artist = (artists[id] ??= { id, name, albumIds: [], trackIds: [] });
      artist.trackIds.push(t.id);
    }
  }

  for (const artist of Object.values(artists)) {
    artist.albumIds.sort((a, b) => (albums[b].year ?? 0) - (albums[a].year ?? 0));
    artist.trackIds.sort((a, b) => sortKey(r.tracks[a].title).localeCompare(sortKey(r.tracks[b].title)));
  }

  const songOrder = visibleTracks
    .map((t) => t.id)
    .sort((a, b) => sortKey(r.tracks[a].title).localeCompare(sortKey(r.tracks[b].title)));
  const albumOrder = Object.keys(albums).sort((a, b) =>
    sortKey(albums[a].title).localeCompare(sortKey(albums[b].title)),
  );
  const artistOrder = Object.keys(artists).sort((a, b) =>
    sortKey(artists[a].name).localeCompare(sortKey(artists[b].name)),
  );

  // Playlists keep songs that still exist.
  const playlists: Record<string, Playlist> = {};
  for (const p of Object.values(r.playlists)) {
    playlists[p.id] = { ...p, trackIds: p.trackIds.filter((id) => r.tracks[id] && !r.tracks[id].missing) };
  }
  const playlistOrder = Object.keys(playlists).sort(
    (a, b) => playlists[b].updatedAt - playlists[a].updatedAt,
  );

  return {
    tracks: r.tracks,
    albums,
    artists,
    playlists,
    songOrder,
    albumOrder,
    artistOrder,
    playlistOrder,
  };
}

export const useLibrary = create<LibraryState>((set, get) => {
  const rebuild = (extra?: Partial<LibraryState>) => set({ ...derive(raw), ...extra });

  return {
    ready: false,
    tracks: {},
    albums: {},
    artists: {},
    playlists: {},
    songOrder: [],
    albumOrder: [],
    artistOrder: [],
    playlistOrder: [],
    artworkVersion: 0,

    hydrate() {
      const data = DB.loadAll();
      const tracks: Record<string, Track> = {};
      for (const t of data.tracks) tracks[t.id] = t;
      const albumRows: Record<string, AlbumRow> = {};
      for (const a of data.albums) albumRows[a.id] = a;
      const playlists: Record<string, Playlist> = {};
      for (const p of data.playlists) playlists[p.id] = { ...p, trackIds: [] };
      for (const pt of data.playlistTracks) playlists[pt.playlistId]?.trackIds.push(pt.trackId);
      raw = { tracks, albumRows, playlists };
      rebuild({ ready: true });
    },

    addImported(tracks, albums) {
      raw = {
        ...raw,
        tracks: { ...raw.tracks, ...Object.fromEntries(tracks.map((t) => [t.id, t])) },
        albumRows: {
          ...Object.fromEntries(albums.map((a) => [a.id, a])),
          ...raw.albumRows,
        },
      };
      rebuild();
    },

    async removeTracks(ids) {
      for (const id of ids) {
        const t = raw.tracks[id];
        if (!t) continue;
        deleteRelative(t.file);
        deleteRelative(t.customArtwork);
      }
      await DB.deleteTracks(ids);
      const tracks = { ...raw.tracks };
      for (const id of ids) delete tracks[id];
      raw = { ...raw, tracks };
      rebuild();
    },

    async updateTrackInfo(id, info) {
      const t = raw.tracks[id];
      if (!t) return;
      const next: Track = { ...t, ...info };
      next.title = next.title.trim() || t.title;
      next.artist = next.artist.trim() || UNKNOWN_ARTIST;
      next.album = next.album.trim() || UNKNOWN_ALBUM;
      const albumArtist = next.albumArtist?.trim() || next.artist;
      next.albumId = albumIdFor(albumArtist, next.album);
      if (!raw.albumRows[next.albumId]) {
        const row: AlbumRow = {
          id: next.albumId,
          title: next.album,
          artist: albumArtist,
          year: next.year,
          customArtwork: null,
          favorite: 0,
          lastPlayed: null,
          dateAdded: Date.now(),
        };
        await DB.ensureAlbum(row);
        raw = { ...raw, albumRows: { ...raw.albumRows, [row.id]: row } };
      }
      await DB.updateTrackFields(id, {
        title: next.title,
        artist: next.artist,
        albumArtist: next.albumArtist?.trim() || null,
        album: next.album,
        albumId: next.albumId,
        trackNumber: next.trackNumber,
        discNumber: next.discNumber,
        year: next.year,
        genre: next.genre,
      });
      raw = { ...raw, tracks: { ...raw.tracks, [id]: next } };
      rebuild();
    },

    toggleFavoriteTrack(id) {
      const t = raw.tracks[id];
      if (!t) return false;
      const favorite = t.favorite ? 0 : 1;
      raw = { ...raw, tracks: { ...raw.tracks, [id]: { ...t, favorite } } };
      void DB.updateTrackFields(id, { favorite });
      set({ tracks: raw.tracks });
      return favorite === 1;
    },

    toggleFavoriteAlbum(id) {
      const row = raw.albumRows[id];
      if (!row) return false;
      const favorite = row.favorite ? 0 : 1;
      raw = { ...raw, albumRows: { ...raw.albumRows, [id]: { ...row, favorite } } };
      void DB.updateAlbumFields(id, { favorite });
      rebuild();
      return favorite === 1;
    },

    recordPlay(trackId) {
      const t = raw.tracks[trackId];
      if (!t) return;
      const now = Date.now();
      raw.tracks = { ...raw.tracks, [trackId]: { ...t, lastPlayed: now, playCount: t.playCount + 1 } };
      void DB.updateTrackFields(trackId, { lastPlayed: now, playCount: t.playCount + 1 });
      const row = raw.albumRows[t.albumId];
      if (row) {
        raw.albumRows = { ...raw.albumRows, [row.id]: { ...row, lastPlayed: now } };
        void DB.updateAlbumFields(row.id, { lastPlayed: now });
      }
      const albums = get().albums;
      const album = albums[t.albumId];
      set({
        tracks: raw.tracks,
        albums: album ? { ...albums, [album.id]: { ...album, lastPlayed: now } } : albums,
      });
    },

    recordPlaylistPlay(playlistId) {
      const p = raw.playlists[playlistId];
      if (!p) return;
      const now = Date.now();
      raw.playlists = { ...raw.playlists, [playlistId]: { ...p, lastPlayed: now } };
      void DB.upsertPlaylist({ ...p, lastPlayed: now });
      rebuild();
    },

    async setAlbumArtwork(albumId, relativePath) {
      const row = raw.albumRows[albumId];
      if (!row) return;
      if (row.customArtwork && row.customArtwork !== relativePath) deleteRelative(row.customArtwork);
      await DB.updateAlbumFields(albumId, { customArtwork: relativePath });
      raw = { ...raw, albumRows: { ...raw.albumRows, [albumId]: { ...row, customArtwork: relativePath } } };
      rebuild({ artworkVersion: get().artworkVersion + 1 });
    },

    async setTrackArtwork(trackId, relativePath) {
      const t = raw.tracks[trackId];
      if (!t) return;
      if (t.customArtwork && t.customArtwork !== relativePath) deleteRelative(t.customArtwork);
      await DB.updateTrackFields(trackId, { customArtwork: relativePath });
      raw = { ...raw, tracks: { ...raw.tracks, [trackId]: { ...t, customArtwork: relativePath } } };
      rebuild({ artworkVersion: get().artworkVersion + 1 });
    },

    async createPlaylist(name, trackIds = []) {
      const now = Date.now();
      const p: Playlist = {
        id: newId(),
        name: name.trim() || 'New Playlist',
        trackIds,
        createdAt: now,
        updatedAt: now,
        lastPlayed: null,
      };
      const row: PlaylistRow = { id: p.id, name: p.name, createdAt: now, updatedAt: now, lastPlayed: null };
      await DB.upsertPlaylist(row);
      if (trackIds.length) await DB.setPlaylistTracks(p.id, trackIds);
      raw = { ...raw, playlists: { ...raw.playlists, [p.id]: p } };
      rebuild();
      return p.id;
    },

    async renamePlaylist(id, name) {
      const p = raw.playlists[id];
      if (!p || !name.trim()) return;
      const next = { ...p, name: name.trim(), updatedAt: Date.now() };
      await DB.upsertPlaylist(next);
      raw = { ...raw, playlists: { ...raw.playlists, [id]: next } };
      rebuild();
    },

    async deletePlaylist(id) {
      await DB.deletePlaylist(id);
      const playlists = { ...raw.playlists };
      delete playlists[id];
      raw = { ...raw, playlists };
      rebuild();
    },

    async addToPlaylist(id, trackIds) {
      const p = raw.playlists[id];
      if (!p) return;
      const next = { ...p, trackIds: [...p.trackIds, ...trackIds], updatedAt: Date.now() };
      raw = { ...raw, playlists: { ...raw.playlists, [id]: next } };
      rebuild();
      await DB.setPlaylistTracks(id, next.trackIds);
    },

    async removeFromPlaylist(id, index) {
      const p = raw.playlists[id];
      if (!p) return;
      const trackIds = [...p.trackIds];
      trackIds.splice(index, 1);
      raw = { ...raw, playlists: { ...raw.playlists, [id]: { ...p, trackIds, updatedAt: Date.now() } } };
      rebuild();
      await DB.setPlaylistTracks(id, trackIds);
    },

    async movePlaylistTrack(id, from, to) {
      const p = raw.playlists[id];
      if (!p || from === to) return;
      const trackIds = [...p.trackIds];
      const [moved] = trackIds.splice(from, 1);
      trackIds.splice(to, 0, moved);
      raw = { ...raw, playlists: { ...raw.playlists, [id]: { ...p, trackIds, updatedAt: Date.now() } } };
      rebuild();
      await DB.setPlaylistTracks(id, trackIds);
    },
  };
});

// MARK: Artwork resolution

/** Album cover: custom artwork wins over the artwork embedded in its files. */
export function albumArtworkPath(album: Album | undefined | null): string | null {
  if (!album) return null;
  return album.customArtwork ?? album.embeddedArtwork;
}

/** Song cover: song override, then album override, then embedded artwork. */
export function trackArtworkPath(track: Track | undefined | null, albums: Record<string, Album>): string | null {
  if (!track) return null;
  const album = albums[track.albumId];
  return track.customArtwork ?? album?.customArtwork ?? track.embeddedArtwork ?? album?.embeddedArtwork ?? null;
}

export function getLibrary() {
  return useLibrary.getState();
}
