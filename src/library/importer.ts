import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import { create } from 'zustand';

import * as DB from '@/db/database';
import type { AlbumRow, TrackRow } from '@/db/database';
import { newId } from '@/lib/ids';
import {
  AUDIO_EXTENSIONS,
  EMBEDDED_ART_DIR,
  MUSIC_DIR,
  ensureDir,
  extensionOf,
  fileForRelative,
} from '@/lib/paths';
import { albumIdFor, getLibrary, UNKNOWN_ARTIST } from '@/stores/library';
import { isAvailable as nativeAvailable, SonderAudio, type FileMetadata } from 'sonder-audio';

export type ImportSummary = {
  added: number;
  duplicates: number;
  failed: { name: string; reason: string }[];
};

type ImportState = {
  active: boolean;
  total: number;
  done: number;
  currentName: string | null;
  lastSummary: ImportSummary | null;
};

export const useImport = create<ImportState>(() => ({
  active: false,
  total: 0,
  done: 0,
  currentName: null,
  lastSummary: null,
}));

/** Opens the iOS Files picker for audio files and imports the selection. */
export async function importFromFiles(): Promise<ImportSummary | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['audio/*', 'public.audio'],
    multiple: true,
    copyToCacheDirectory: true,
  });
  if (result.canceled || result.assets.length === 0) return null;
  const sources = result.assets.map((a) => ({ file: new File(a.uri), name: a.name, move: true }));
  return runImport(sources);
}

/**
 * Picks up audio files the user dropped into SONDER's folder with the Files app or Finder
 * (Documents root or Documents/Music) that aren't in the library yet.
 */
export async function scanForNewFiles(): Promise<ImportSummary | null> {
  ensureDir(MUSIC_DIR);
  const known = new Set(Object.values(getLibrary().tracks).map((t) => t.file));
  const sources: { file: File; name: string; move: boolean }[] = [];

  const consider = (dir: Directory, prefix: string, move: boolean) => {
    for (const item of dir.list()) {
      if (!(item instanceof File)) continue;
      const rel = prefix ? `${prefix}/${item.name}` : item.name;
      if (!AUDIO_EXTENSIONS.has(extensionOf(item.name))) continue;
      if (known.has(rel)) continue;
      sources.push({ file: item, name: item.name, move });
    }
  };

  consider(Paths.document, '', true);
  consider(new Directory(Paths.document, MUSIC_DIR), MUSIC_DIR, false);
  if (sources.length === 0) return { added: 0, duplicates: 0, failed: [] };
  return runImport(sources);
}

async function runImport(sources: { file: File; name: string; move: boolean }[]): Promise<ImportSummary> {
  if (!nativeAvailable) {
    const summary: ImportSummary = {
      added: 0,
      duplicates: 0,
      failed: [{ name: 'Import', reason: 'Importing needs the Davesic development build (not Expo Go).' }],
    };
    useImport.setState({ lastSummary: summary });
    return summary;
  }

  ensureDir(MUSIC_DIR);
  ensureDir(EMBEDDED_ART_DIR);
  useImport.setState({ active: true, total: sources.length, done: 0, currentName: null, lastSummary: null });

  const summary: ImportSummary = { added: 0, duplicates: 0, failed: [] };
  const knownHashes = new Set(
    Object.values(getLibrary().tracks)
      .map((t) => t.hash)
      .filter((h): h is string => !!h),
  );
  const batchTracks: TrackRow[] = [];
  const batchAlbums: AlbumRow[] = [];

  const flush = () => {
    if (batchTracks.length === 0) return;
    getLibrary().addImported(batchTracks.splice(0), batchAlbums.splice(0));
  };

  for (let i = 0; i < sources.length; i++) {
    const source = sources[i];
    useImport.setState({ currentName: source.name });
    try {
      const outcome = await importOne(source, knownHashes);
      if (outcome.kind === 'added') {
        summary.added++;
        batchTracks.push(outcome.track);
        if (outcome.album) batchAlbums.push(outcome.album);
      } else if (outcome.kind === 'duplicate') {
        summary.duplicates++;
      } else {
        summary.failed.push({ name: source.name, reason: outcome.reason });
      }
    } catch (e) {
      summary.failed.push({ name: source.name, reason: e instanceof Error ? e.message : 'Unknown error' });
    }
    useImport.setState({ done: i + 1 });
    // Show progress in the library as it happens, without re-rendering on every file.
    if (batchTracks.length >= 25) flush();
    // Yield so the UI stays responsive during large imports.
    await new Promise((r) => setTimeout(r, 0));
  }
  flush();

  useImport.setState({ active: false, currentName: null, lastSummary: summary });
  return summary;
}

type Outcome =
  | { kind: 'added'; track: TrackRow; album: AlbumRow | null }
  | { kind: 'duplicate' }
  | { kind: 'failed'; reason: string };

async function importOne(
  source: { file: File; name: string; move: boolean },
  knownHashes: Set<string>,
): Promise<Outcome> {
  const ext = extensionOf(source.name);
  if (!AUDIO_EXTENSIONS.has(ext)) {
    return { kind: 'failed', reason: `.${ext || '?'} files aren't supported` };
  }

  let hash: string | null = null;
  try {
    hash = await source.file.digest('MD5');
  } catch {
    hash = null;
  }
  if (hash && knownHashes.has(hash)) {
    if (source.move) safeDelete(source.file);
    return { kind: 'duplicate' };
  }

  // Move or copy into Documents/Music with a readable, unique name.
  const id = newId();
  let relative: string;
  const alreadyInMusic = source.file.uri.includes(`/${MUSIC_DIR}/`) && !source.move;
  if (alreadyInMusic) {
    relative = `${MUSIC_DIR}/${source.file.name}`;
  } else {
    relative = uniqueMusicPath(source.name);
    const dest = fileForRelative(relative);
    if (source.move) {
      await source.file.move(dest);
    } else {
      await source.file.copy(dest);
    }
  }
  const dest = fileForRelative(relative);

  const artworkRelative = `${EMBEDDED_ART_DIR}/${id}.jpg`;
  const meta: FileMetadata = await SonderAudio.readMetadata(dest.uri, fileForRelative(artworkRelative).uri);

  if (!meta.playable) {
    if (!alreadyInMusic) safeDelete(dest);
    return { kind: 'failed', reason: "iOS can't decode this file" };
  }

  const guessed = guessFromFilename(source.name);
  const artist = meta.artist || guessed.artist || UNKNOWN_ARTIST;
  const albumArtist = meta.albumArtist || null;
  // Albums are optional: a song without album info stays a standalone song.
  const album = meta.album?.trim() || '';
  const albumId = album ? albumIdFor(albumArtist || artist, album) : '';
  const now = Date.now();

  const track: TrackRow = {
    id,
    file: relative,
    title: meta.title || guessed.title,
    artist,
    albumArtist,
    album,
    albumId,
    genre: meta.genre ?? null,
    year: meta.year ?? null,
    trackNumber: meta.trackNumber ?? guessed.trackNumber ?? null,
    discNumber: meta.discNumber ?? null,
    duration: meta.duration ?? 0,
    embeddedArtwork: meta.artworkPath ? artworkRelative : null,
    customArtwork: null,
    hash,
    fileSize: dest.size ?? 0,
    dateAdded: now,
    lastPlayed: null,
    playCount: 0,
    favorite: 0,
    missing: 0,
  };
  const albumRow: AlbumRow | null = albumId ? {
    id: albumId,
    title: album,
    artist: albumArtist || artist,
    year: meta.year ?? null,
    customArtwork: null,
    favorite: 0,
    lastPlayed: null,
    dateAdded: now,
  } : null;

  if (albumRow) await DB.ensureAlbum(albumRow);
  await DB.insertTrack(track);
  if (hash) knownHashes.add(hash);
  return { kind: 'added', track, album: albumRow };
}

function uniqueMusicPath(originalName: string): string {
  const clean = originalName.replace(/[/\\:*?"<>|]/g, '_').trim() || 'Track';
  const dot = clean.lastIndexOf('.');
  const base = dot > 0 ? clean.slice(0, dot) : clean;
  const ext = dot > 0 ? clean.slice(dot) : '';
  let candidate = `${MUSIC_DIR}/${clean}`;
  let n = 2;
  while (fileForRelative(candidate).exists) {
    candidate = `${MUSIC_DIR}/${base} ${n}${ext}`;
    n++;
  }
  return candidate;
}

/** "03 - Artist - Title.mp3", "Artist - Title.m4a", "Title.flac" */
export function guessFromFilename(name: string): { title: string; artist?: string; trackNumber?: number } {
  const base = name.replace(/\.[^.]+$/, '').replace(/_/g, ' ').trim();
  let rest = base;
  let trackNumber: number | undefined;
  const numMatch = rest.match(/^(\d{1,3})[\s.\-_]+(.+)$/);
  if (numMatch) {
    trackNumber = parseInt(numMatch[1], 10);
    rest = numMatch[2];
  }
  const parts = rest.split(/\s+-\s+/);
  if (parts.length >= 2) {
    return { artist: parts[0].trim(), title: parts.slice(1).join(' - ').trim(), trackNumber };
  }
  return { title: rest || base || 'Untitled', trackNumber };
}

function safeDelete(file: File) {
  try {
    if (file.exists) file.delete();
  } catch {
    // ignore
  }
}

/** Marks songs whose files were removed outside the app (e.g. deleted in the Files app). */
export async function verifyLibraryFiles() {
  const tracks = Object.values(getLibrary().tracks);
  let changed = false;
  for (let i = 0; i < tracks.length; i++) {
    const t = tracks[i];
    const exists = fileForRelative(t.file).exists;
    const missing = exists ? 0 : 1;
    if (missing !== t.missing) {
      changed = true;
      await DB.updateTrackFields(t.id, { missing });
    }
    if (i % 200 === 199) await new Promise((r) => setTimeout(r, 0));
  }
  if (changed) getLibrary().hydrate();
}
