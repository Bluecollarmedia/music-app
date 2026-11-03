import { Link, router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { memo } from 'react';
import { ActionSheetIOS, Pressable, StyleSheet, Text, View } from 'react-native';

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
  /**
   * Spotify-style row: larger artwork, bold white title, artist only underneath,
   * and a visible ⋯ button on the right (same actions as touch-and-hold).
   */
  prominent?: boolean;
};

export const TrackRow = memo(function TrackRow({
  trackId,
  onPress,
  variant = 'artwork',
  subtitle = 'artistAlbum',
  onRemove,
  prominent = false,
}: Props) {
  const track = useLibrary((s) => s.tracks[trackId]);
  const artwork = useTrackArtwork(variant === 'artwork' ? trackId : null);
  const isCurrent = usePlayer((s) => s.trackId === trackId);
  const isPlaying = usePlayer((s) => s.trackId === trackId && s.isPlaying);
  const hrefs = useHrefs();

  if (!track) return null;

  const sub =
    prominent || subtitle === 'artist'
      ? track.artist
      : subtitle === 'artistAlbum'
        ? `${track.artist} · ${track.album}`
        : null;

  const a11y = `${track.title}, ${track.artist}${isCurrent ? ', now playing' : ''}`;

  const showActions = () => {
    const actions: { title: string; run: () => void; destructive?: boolean }[] = [
      { title: 'Play Next', run: () => playNext([trackId]) },
      { title: 'Add to Queue', run: () => addToQueue([trackId]) },
      { title: 'Add to Playlist…', run: () => router.push({ pathname: '/add-to-playlist', params: { ids: trackId } }) },
      { title: track.favorite ? 'Remove from Favorites' : 'Favorite', run: () => toggleFavoriteTrack(trackId) },
      { title: 'Go to Album', run: () => router.push(hrefs.album(track.albumId)) },
      { title: 'Go to Artist', run: () => router.push(hrefs.artist(artistIdFor(track.artist))) },
      { title: 'Share Song…', run: () => void shareTrack(trackId) },
      {
        title: 'Change Artwork…',
        run: () => router.push({ pathname: '/artwork-editor', params: { kind: 'track', id: trackId } }),
      },
      { title: 'Song Info…', run: () => router.push({ pathname: '/edit-info', params: { id: trackId } }) },
      onRemove
        ? { title: onRemove.title, run: onRemove.action, destructive: true }
        : { title: 'Delete from Library', run: () => confirmDeleteTracks([trackId], `“${track.title}”`), destructive: true },
    ];
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: track.title,
        message: track.artist,
        options: [...actions.map((a) => a.title), 'Cancel'],
        destructiveButtonIndex: actions.length - 1,
        cancelButtonIndex: actions.length,
      },
      (i) => actions[i]?.run(),
    );
  };

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
            <Artwork path={artwork} size={prominent ? 56 : layout.rowArtwork} radius={prominent ? 6 : undefined} />
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
              style={[styles.title, prominent && styles.titleProminent, isCurrent && !prominent && { color: colors.accent }]}
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
          {track.favorite && !prominent ? (
            <SymbolView name="heart.fill" size={12} tintColor={colors.favorite} style={styles.heart} />
          ) : null}
          {variant === 'number' ? (
            <Text style={styles.duration}>{formatTime(track.duration)}</Text>
          ) : null}
          {prominent ? (
            <Pressable
              onPress={showActions}
              hitSlop={12}
              style={styles.more}
              accessibilityRole="button"
              accessibilityLabel={`More options for ${track.title}`}
            >
              <SymbolView name="ellipsis" size={18} weight="bold" tintColor={colors.secondaryLabel} />
            </Pressable>
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
  titleProminent: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.4,
    color: colors.label,
  },
  more: {
    width: 36,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -space.sm,
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
