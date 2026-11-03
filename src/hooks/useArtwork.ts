import { albumArtworkPath, trackArtworkPath, useLibrary } from '@/stores/library';

/** Resolved artwork path for a song; re-renders only when that path changes. */
export function useTrackArtwork(trackId: string | null | undefined): string | null {
  return useLibrary((s) => (trackId ? trackArtworkPath(s.tracks[trackId], s.albums) : null));
}

export function useAlbumArtwork(albumId: string | null | undefined): string | null {
  return useLibrary((s) => (albumId ? albumArtworkPath(s.albums[albumId]) : null));
}

/** Up to four distinct covers from a playlist, for a mosaic. */
export function usePlaylistArtworks(playlistId: string): string[] {
  const playlist = useLibrary((s) => s.playlists[playlistId]);
  const tracks = useLibrary((s) => s.tracks);
  const albums = useLibrary((s) => s.albums);
  if (!playlist) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const id of playlist.trackIds) {
    const p = trackArtworkPath(tracks[id], albums);
    if (p && !seen.has(p)) {
      seen.add(p);
      result.push(p);
      if (result.length === 4) break;
    }
  }
  return result;
}
