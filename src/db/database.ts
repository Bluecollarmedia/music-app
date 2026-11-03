import { openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';

/** A song in the library. File and artwork paths are relative to Documents. */
export type TrackRow = {
  id: string;
  file: string;
  title: string;
  artist: string;
  albumArtist: string | null;
  album: string;
  albumId: string;
  genre: string | null;
  year: number | null;
  trackNumber: number | null;
  discNumber: number | null;
  duration: number;
  embeddedArtwork: string | null;
  customArtwork: string | null;
  hash: string | null;
  fileSize: number;
  dateAdded: number;
  lastPlayed: number | null;
  playCount: number;
  favorite: number;
  missing: number;
};

export type AlbumRow = {
  id: string;
  title: string;
  artist: string;
  year: number | null;
  customArtwork: string | null;
  favorite: number;
  lastPlayed: number | null;
  dateAdded: number;
};

export type PlaylistRow = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  lastPlayed: number | null;
};

export type PlaylistTrackRow = {
  playlistId: string;
  trackId: string;
  position: number;
};

let db: SQLiteDatabase | null = null;

const MIGRATIONS: string[] = [
  `
  CREATE TABLE IF NOT EXISTS tracks (
    id TEXT PRIMARY KEY NOT NULL,
    file TEXT NOT NULL,
    title TEXT NOT NULL,
    artist TEXT NOT NULL,
    albumArtist TEXT,
    album TEXT NOT NULL,
    albumId TEXT NOT NULL,
    genre TEXT,
    year INTEGER,
    trackNumber INTEGER,
    discNumber INTEGER,
    duration REAL NOT NULL DEFAULT 0,
    embeddedArtwork TEXT,
    customArtwork TEXT,
    hash TEXT,
    fileSize INTEGER NOT NULL DEFAULT 0,
    dateAdded INTEGER NOT NULL,
    lastPlayed INTEGER,
    playCount INTEGER NOT NULL DEFAULT 0,
    favorite INTEGER NOT NULL DEFAULT 0,
    missing INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_tracks_album ON tracks(albumId);
  CREATE INDEX IF NOT EXISTS idx_tracks_hash ON tracks(hash);

  CREATE TABLE IF NOT EXISTS albums (
    id TEXT PRIMARY KEY NOT NULL,
    title TEXT NOT NULL,
    artist TEXT NOT NULL,
    year INTEGER,
    customArtwork TEXT,
    favorite INTEGER NOT NULL DEFAULT 0,
    lastPlayed INTEGER,
    dateAdded INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS playlists (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL,
    lastPlayed INTEGER
  );

  CREATE TABLE IF NOT EXISTS playlist_tracks (
    playlistId TEXT NOT NULL,
    trackId TEXT NOT NULL,
    position INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_playlist_tracks ON playlist_tracks(playlistId, position);
  `,
  `
  CREATE TABLE IF NOT EXISTS artists (
    id TEXT PRIMARY KEY NOT NULL,
    image TEXT
  );
  `,
];

export function getDb(): SQLiteDatabase {
  if (db) return db;
  db = openDatabaseSync('sonder.db');
  db.execSync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = OFF;');
  const row = db.getFirstSync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;
  while (version < MIGRATIONS.length) {
    const sql = MIGRATIONS[version];
    db.withTransactionSync(() => {
      db!.execSync(sql);
    });
    version++;
    db.execSync(`PRAGMA user_version = ${version}`);
  }
  return db;
}

export function loadAll() {
  const d = getDb();
  return {
    tracks: d.getAllSync<TrackRow>('SELECT * FROM tracks'),
    albums: d.getAllSync<AlbumRow>('SELECT * FROM albums'),
    playlists: d.getAllSync<PlaylistRow>('SELECT * FROM playlists'),
    artists: d.getAllSync<{ id: string; image: string | null }>('SELECT * FROM artists'),
    playlistTracks: d.getAllSync<PlaylistTrackRow>(
      'SELECT * FROM playlist_tracks ORDER BY playlistId, position',
    ),
  };
}

export async function insertTrack(t: TrackRow) {
  await getDb().runAsync(
    `INSERT OR REPLACE INTO tracks
      (id, file, title, artist, albumArtist, album, albumId, genre, year, trackNumber, discNumber,
       duration, embeddedArtwork, customArtwork, hash, fileSize, dateAdded, lastPlayed, playCount, favorite, missing)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    t.id, t.file, t.title, t.artist, t.albumArtist, t.album, t.albumId, t.genre, t.year,
    t.trackNumber, t.discNumber, t.duration, t.embeddedArtwork, t.customArtwork, t.hash,
    t.fileSize, t.dateAdded, t.lastPlayed, t.playCount, t.favorite, t.missing,
  );
}

export async function ensureAlbum(a: AlbumRow) {
  await getDb().runAsync(
    `INSERT OR IGNORE INTO albums (id, title, artist, year, customArtwork, favorite, lastPlayed, dateAdded)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    a.id, a.title, a.artist, a.year, a.customArtwork, a.favorite, a.lastPlayed, a.dateAdded,
  );
}

/** The artist's chosen picture (a path inside Davesic's folder), or null to go back to automatic. */
export async function setArtistImage(id: string, image: string | null) {
  await getDb().runAsync('INSERT OR REPLACE INTO artists (id, image) VALUES (?, ?)', id, image);
}

export async function updateTrackFields(id: string, fields: Partial<TrackRow>) {
  const keys = Object.keys(fields) as (keyof TrackRow)[];
  if (keys.length === 0) return;
  const sets = keys.map((k) => `${k} = ?`).join(', ');
  const values = keys.map((k) => fields[k] as string | number | null);
  await getDb().runAsync(`UPDATE tracks SET ${sets} WHERE id = ?`, ...values, id);
}

export async function updateAlbumFields(id: string, fields: Partial<AlbumRow>) {
  const keys = Object.keys(fields) as (keyof AlbumRow)[];
  if (keys.length === 0) return;
  const sets = keys.map((k) => `${k} = ?`).join(', ');
  const values = keys.map((k) => fields[k] as string | number | null);
  await getDb().runAsync(`UPDATE albums SET ${sets} WHERE id = ?`, ...values, id);
}

export async function deleteTracks(ids: string[]) {
  if (ids.length === 0) return;
  const d = getDb();
  await d.withTransactionAsync(async () => {
    for (const id of ids) {
      await d.runAsync('DELETE FROM tracks WHERE id = ?', id);
      await d.runAsync('DELETE FROM playlist_tracks WHERE trackId = ?', id);
    }
    await d.runAsync('DELETE FROM albums WHERE id NOT IN (SELECT DISTINCT albumId FROM tracks)');
  });
}

export async function upsertPlaylist(p: PlaylistRow) {
  await getDb().runAsync(
    `INSERT OR REPLACE INTO playlists (id, name, createdAt, updatedAt, lastPlayed) VALUES (?, ?, ?, ?, ?)`,
    p.id, p.name, p.createdAt, p.updatedAt, p.lastPlayed,
  );
}

export async function deletePlaylist(id: string) {
  const d = getDb();
  await d.withTransactionAsync(async () => {
    await d.runAsync('DELETE FROM playlist_tracks WHERE playlistId = ?', id);
    await d.runAsync('DELETE FROM playlists WHERE id = ?', id);
  });
}

/** Replaces a playlist's track list in one transaction. */
export async function setPlaylistTracks(playlistId: string, trackIds: string[]) {
  const d = getDb();
  await d.withTransactionAsync(async () => {
    await d.runAsync('DELETE FROM playlist_tracks WHERE playlistId = ?', playlistId);
    for (let i = 0; i < trackIds.length; i++) {
      await d.runAsync(
        'INSERT INTO playlist_tracks (playlistId, trackId, position) VALUES (?, ?, ?)',
        playlistId, trackIds[i], i,
      );
    }
    await d.runAsync('UPDATE playlists SET updatedAt = ? WHERE id = ?', Date.now(), playlistId);
  });
}
