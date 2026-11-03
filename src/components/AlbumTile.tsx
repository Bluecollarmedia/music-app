import { Link, router } from 'expo-router';
import { memo } from 'react';
import { StyleSheet, Text } from 'react-native';

import { Artwork } from '@/components/Artwork';
import { Touchable } from '@/components/Touchable';
import { useAlbumArtwork } from '@/hooks/useArtwork';
import { useHrefs } from '@/hooks/useTab';
import { addToQueue, playNext, toggleFavoriteAlbum } from '@/library/actions';
import { artistIdFor, useLibrary } from '@/stores/library';
import { player } from '@/stores/player';
import { colors, space, type } from '@/theme';

type Props = {
  albumId: string;
  width: number;
  /** Second line under the title. */
  caption?: 'artist' | 'year';
};

/** Album cover with title and artist. Tap opens the album; touch and hold for a native menu. */
export const AlbumTile = memo(function AlbumTile({ albumId, width, caption = 'artist' }: Props) {
  const album = useLibrary((s) => s.albums[albumId]);
  const artwork = useAlbumArtwork(albumId);
  const hrefs = useHrefs();
  if (!album) return null;

  const second = caption === 'year' ? (album.year ? String(album.year) : ' ') : album.artist;

  return (
    <Link href={hrefs.album(albumId)} asChild>
      <Link.Trigger>
        <Touchable
          style={{ width }}
          pressedStyle={{ opacity: 0.75 }}
          accessibilityRole="button"
          accessibilityLabel={`${album.title}, ${album.artist}`}
        >
          <Artwork path={artwork} size={width} />
          <Text style={styles.title} numberOfLines={1}>
            {album.title}
          </Text>
          <Text style={styles.caption} numberOfLines={1}>
            {second}
          </Text>
        </Touchable>
      </Link.Trigger>
      <Link.Preview />
      <Link.Menu>
        <Link.MenuAction title="Play" icon="play" onPress={() => player.playTracks(album.trackIds, 0, { shuffle: false })} />
        <Link.MenuAction title="Shuffle" icon="shuffle" onPress={() => player.playTracks(album.trackIds, 0, { shuffle: true })} />
        <Link.MenuAction title="Play Next" icon="text.insert" onPress={() => playNext(album.trackIds)} />
        <Link.MenuAction title="Add to Queue" icon="text.append" onPress={() => addToQueue(album.trackIds)} />
        <Link.MenuAction
          title="Add to Playlist…"
          icon="music.note.list"
          onPress={() => router.push({ pathname: '/add-to-playlist', params: { ids: album.trackIds.join(',') } })}
        />
        <Link.MenuAction
          title={album.favorite ? 'Remove from Favorites' : 'Favorite'}
          icon={album.favorite ? 'heart.slash' : 'heart'}
          onPress={() => toggleFavoriteAlbum(albumId)}
        />
        <Link.Menu inline title="">
          <Link.MenuAction
            title="Edit Album…"
            icon="pencil"
            onPress={() => router.push({ pathname: '/edit-info', params: { kind: 'album', id: albumId } })}
          />
          <Link.MenuAction
            title="Change Album Cover…"
            icon="photo"
            onPress={() => router.push({ pathname: '/artwork-editor', params: { kind: 'album', id: albumId } })}
          />
          <Link.MenuAction
            title="Go to Artist"
            icon="music.mic"
            onPress={() => router.push(hrefs.artist(artistIdFor(album.artist)))}
          />
        </Link.Menu>
      </Link.Menu>
    </Link>
  );
});

const styles = StyleSheet.create({
  title: {
    ...type.subhead,
    fontWeight: '500',
    color: colors.label,
    marginTop: space.sm,
  },
  caption: {
    ...type.subhead,
    color: colors.secondaryLabel,
    marginTop: 1,
  },
});
