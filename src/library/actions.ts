import { Alert, Share } from 'react-native';

import { haptics } from '@/lib/haptics';
import { resolveUri } from '@/lib/paths';
import { getLibrary, trackArtworkPath } from '@/stores/library';
import { player } from '@/stores/player';
import { SonderAudio } from 'sonder-audio';

/**
 * Shares the song file itself (AirDrop, Messages, Files…), with the library's current
 * title, artist, album and artwork written into the copy. The library's file is untouched.
 */
export async function shareTrack(id: string) {
  const { tracks, albums } = getLibrary();
  const track = tracks[id];
  if (!track) return;
  const uri = resolveUri(track.file);
  if (!uri || track.missing) {
    Alert.alert('Can’t Share', 'This song’s file is missing from your iPhone.');
    return;
  }
  try {
    const url = await SonderAudio.exportForSharing({
      uri,
      title: track.title,
      artist: track.artist,
      album: track.album,
      albumArtist: track.albumArtist,
      genre: track.genre,
      year: track.year,
      trackNumber: track.trackNumber,
      discNumber: track.discNumber,
      artworkUri: resolveUri(trackArtworkPath(track, albums)),
    });
    await Share.share({ url });
  } catch (e) {
    Alert.alert('Can’t Share', e instanceof Error ? e.message : 'Something went wrong preparing the song.');
  }
}

export async function playNext(ids: string[]) {
  await player.playNext(ids);
  haptics.light();
}

export async function addToQueue(ids: string[]) {
  await player.addToQueue(ids);
  haptics.light();
}

export function toggleFavoriteTrack(id: string) {
  const nowFavorite = getLibrary().toggleFavoriteTrack(id);
  if (nowFavorite) haptics.success();
  return nowFavorite;
}

export function toggleFavoriteAlbum(id: string) {
  const nowFavorite = getLibrary().toggleFavoriteAlbum(id);
  if (nowFavorite) haptics.success();
  return nowFavorite;
}

export function confirmDeleteTracks(ids: string[], label: string, onDone?: () => void) {
  Alert.alert(
    `Delete ${label}?`,
    'The music file will be removed from Davesic and from this iPhone. This can’t be undone.',
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await getLibrary().removeTracks(ids);
          onDone?.();
        },
      },
    ],
  );
}
