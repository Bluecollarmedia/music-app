import { Alert } from 'react-native';

import { haptics } from '@/lib/haptics';
import { getLibrary } from '@/stores/library';
import { player } from '@/stores/player';

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
    'The music file will be removed from SONDER and from this iPhone. This can’t be undone.',
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
