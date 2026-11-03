import { Directory, File, Paths } from 'expo-file-system';

/**
 * Files are stored relative to the app's Documents folder. iOS can move the app container
 * between launches/updates, so absolute paths must never be persisted.
 *
 * Documents/
 *   Music/            imported audio (visible in the Files app under "On My iPhone > SONDER")
 *   .sonder/artwork/  extracted and custom artwork (hidden)
 */
export const MUSIC_DIR = 'Music';
export const EMBEDDED_ART_DIR = '.sonder/artwork/embedded';
export const CUSTOM_ART_DIR = '.sonder/artwork/custom';

export function documentsUri(): string {
  return Paths.document.uri;
}

export function resolveUri(relativePath: string | null | undefined): string | null {
  if (!relativePath) return null;
  return new File(Paths.document, relativePath).uri;
}

export function ensureDir(relativePath: string): Directory {
  const dir = new Directory(Paths.document, relativePath);
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

export function fileForRelative(relativePath: string): File {
  return new File(Paths.document, relativePath);
}

export function deleteRelative(relativePath: string | null | undefined) {
  if (!relativePath) return;
  try {
    const f = fileForRelative(relativePath);
    if (f.exists) f.delete();
  } catch {
    // Already gone.
  }
}

export const AUDIO_EXTENSIONS = new Set([
  'mp3', 'm4a', 'aac', 'alac', 'wav', 'aif', 'aiff', 'aifc', 'caf', 'flac', 'mp4',
]);

export function extensionOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i + 1).toLowerCase() : '';
}
