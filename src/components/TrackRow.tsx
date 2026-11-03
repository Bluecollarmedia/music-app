import { Link, router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Artwork } from '@/components/Artwork';
import { Touchable } from '@/components/Touchable';
import { useTrackArtwork } from '@/hooks/useArtwork';
import { useHrefs } from '@/hooks/useTab';
import { addToQueue, confirmDeleteTracks, playNext, shareTrack, toggleFavoriteTrack } from '@/library/actions';
import { formatTime } from '@/lib/format';
import { artistIdFor, useLibrary } from '@/stores/library';
import { usePlayer } from '@/stores/player';
import { colors, layout, space, type } from '@/theme';

type Props = {
  trackId: string;
  onPress: () => void;
  /** Album pages show track numbers instead of artwork. */
  variant?: 'artwork' | 'number';
  subtitle?: 'artist' | 'artistAlbum' | 'none';
  /** Extra menu action, e.g. "Remove from Playlist". */
  onRemove?: { title: string; action: () => void };
};

export const TrackRow = memo(function TrackRow({
  trackId,
  onPress,
  variant = 'artwork',
  subtitle = 'artistAlbum',
  onRemove,
}: Props) {
  const track = useLibrary((s) => s.tracks[trackId]);
  const artwork = useTrackArtwork(variant === 'artwork' ? trackId : null);
  const isCurrent = usePlayer((s) => s.trackId === trackId);
  const isPlaying = usePlayer((s) => s.trackId === trackId && s.isPlaying);
  const hrefs = useHrefs();

  if (!track) return null;

  const sub =
    subtitle === 'artist'
      ? track.artist
      : subtitle === 'artistAlbum'
        ? `${track.artist} · ${track.album}`
        : null;

  const a11y = `${track.title}, ${track.artist}${isCurrent ? ', now playing' : ''}`;

  return (
    <Link
      href={hrefs.album(track.albumId)}
      asChild
      onPress={(e) => {
        // Tapping a song plays it; the link is only used for the native context menu.
        e.preventDefault();
        onPress();
      }}
    >
      <Link.Trigger>
        <Touchable
          style={[styles.row]}
          pressedStyle={styles.pressed}
          accessibilityRole="button"
          accessibilityLabel={a11y}
          accessibilityHint="Plays this song. Touch and hold for more options."
        >
          {variant === 'artwork' ? (
            <Artwork path={artwork} size={layout.rowArtwork} />
          ) : (
            <View style={styles.number}>
              {isCurrent ? (
                <SymbolView
                  name={isPlaying ? 'speaker.wave.2.fill' : 'speaker.fill'}
                  size={15}
                  tintColor={colors.accent}
                />
              ) : (
                <Text style={styles.numberText}>{track.trackNumber ?? '–'}</Text>
              )}
            </View>
          )}
          <View style={styles.text}>
            <Text
              style={[styles.title, isCurrent && { color: colors.accent }]}
              numberOfLines={1}
            >
              {track.title}
            </Text>
            {sub ? (
              <Text style={styles.subtitle} numberOfLines={1}>
                {sub}
              </Text>
            ) : null}
          </View>
          {track.favorite ? (
            <SymbolView name="heart.fill" size={12} tintColor={colors.favorite} style={styles.heart} />
          ) : null}
          {variant === 'number' ? (
            <Text style={styles.duration}>{formatTime(track.duration)}</Text>
          ) : null}
        </Touchable>
      </Link.Trigger>
      <Link.Menu>
        <Link.MenuAction title="Play Next" icon="text.insert" onPress={() => playNext([trackId])} />
        <Link.MenuAction title="Add to Queue" icon="text.append" onPress={() => addToQueue([trackId])} />
        <Link.MenuAction
          title="Add to Playlist…"
          icon="music.note.list"
          onPress={() => router.push({ pathname: '/add-to-playlist', params: { ids: trackId } })}
        />
        <Link.MenuAction
          title={track.favorite ? 'Remove from Favorites' : 'Favorite'}
          icon={track.favorite ? 'heart.slash' : 'heart'}
          onPress={() => toggleFavoriteTrack(trackId)}
        />
        <Link.Menu inline title="">
          <Link.MenuAction title="Go to Album" icon="square.stack" onPress={() => router.push(hrefs.album(track.albumId))} />
          <Link.MenuAction
            title="Go to Artist"
            icon="music.mic"
            onPress={() => router.push(hrefs.artist(artistIdFor(track.artist)))}
          />
        </Link.Menu>
        <Link.Menu inline title="">
          <Link.MenuAction
            title="Change Artwork…"
            icon="photo"
            onPress={() => router.push({ pathname: '/artwork-editor', params: { kind: 'track', id: trackId } })}
          />
          <Link.MenuAction
            title="Song Info…"
            icon="info.circle"
            onPress={() => router.push({ pathname: '/edit-info', params: { id: trackId } })}
          />
          <Link.MenuAction title="Share Song…" icon="square.and.arrow.up" onPress={() => shareTrack(trackId)} />
        </Link.Menu>
        {onRemove ? (
          <Link.MenuAction title={onRemove.title} icon="minus.circle" destructive onPress={onRemove.action} />
        ) : (
          <Link.MenuAction
            title="Delete from Library"
            icon="trash"
            destructive
            onPress={() => confirmDeleteTracks([trackId], `“${track.title}”`)}
          />
        )}
      </Link.Menu>
    </Link>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: layout.rowHeight,
    paddingHorizontal: space.screen,
    paddingVertical: space.sm,
    gap: space.md,
    backgroundColor: 'transparent',
  },
  pressed: {
    backgroundColor: colors.fill,
  },
  number: {
    width: 24,
    alignItems: 'center',
  },
  numberText: {
    ...type.subhead,
    ...type.monoDigits,
    color: colors.secondaryLabel,
  },
  text: {
    flex: 1,
    gap: 2,
  },
  title: {
    ...type.body,
    color: colors.label,
  },
  subtitle: {
    ...type.subhead,
    color: colors.secondaryLabel,
  },
  heart: {
    width: 12,
    height: 12,
  },
  duration: {
    ...type.subhead,
    ...type.monoDigits,
    color: colors.secondaryLabel,
  },
});
