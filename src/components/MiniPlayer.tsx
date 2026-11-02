import { Link, router } from 'expo-router';
import { NativeTabs } from 'expo-router/native-tabs';
import { SymbolView } from 'expo-symbols';
import { useMemo } from 'react';
import { PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';

import { Artwork } from '@/components/Artwork';
import { useTrackArtwork } from '@/hooks/useArtwork';
import { useLibrary } from '@/stores/library';
import { player, usePlayer } from '@/stores/player';
import { colors, space, type } from '@/theme';

/**
 * The player that lives in the native tab bar's bottom accessory (iOS 26 Liquid Glass).
 * The system draws the glass capsule and moves it when the tab bar minimizes, so this
 * component only lays out content and never animates its own size or position.
 */
export function MiniPlayer() {
  const placement = NativeTabs.BottomAccessory.usePlacement();
  const trackId = usePlayer((s) => s.trackId);
  const isPlaying = usePlayer((s) => s.isPlaying);
  const track = useLibrary((s) => (trackId ? s.tracks[trackId] : undefined));
  const artwork = useTrackArtwork(trackId);
  const inline = placement === 'inline';

  // Swipe up on the mini-player opens Now Playing, like dragging a card up.
  const swipeUp = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => g.dy < -8 && Math.abs(g.dy) > Math.abs(g.dx),
        onPanResponderRelease: (_, g) => {
          if (g.dy < -24 || g.vy < -0.4) router.push('/now-playing');
        },
      }),
    [],
  );

  const title = track?.title ?? 'Not Playing';
  const subtitle = track?.artist ?? 'Choose something to play';

  return (
    <View style={styles.container} {...swipeUp.panHandlers}>
      <Link href="/now-playing" asChild>
        <Pressable
          style={styles.main}
          accessibilityRole="button"
          accessibilityLabel={track ? `Now playing: ${title} by ${subtitle}` : 'Nothing playing'}
          accessibilityHint="Opens Now Playing"
        >
          <Link.AppleZoom>
            <Artwork path={artwork} size={inline ? 28 : 36} radius={inline ? 6 : 8} transitionMs={250} />
          </Link.AppleZoom>
          <View style={styles.text}>
            <Text style={[styles.title, inline && styles.titleInline]} numberOfLines={1}>
              {title}
            </Text>
            {!inline ? (
              <Text style={styles.subtitle} numberOfLines={1}>
                {subtitle}
              </Text>
            ) : null}
          </View>
        </Pressable>
      </Link>
      <Pressable
        onPress={player.toggle}
        hitSlop={10}
        style={({ pressed }) => [styles.control, pressed && styles.controlPressed]}
        accessibilityRole="button"
        accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
        disabled={!track}
      >
        <SymbolView
          name={isPlaying ? 'pause.fill' : 'play.fill'}
          size={inline ? 18 : 21}
          tintColor={colors.label}
        />
      </Pressable>
      {!inline ? (
        <Pressable
          onPress={player.next}
          hitSlop={10}
          style={({ pressed }) => [styles.control, pressed && styles.controlPressed]}
          accessibilityRole="button"
          accessibilityLabel="Next song"
          disabled={!track}
        >
          <SymbolView name="forward.fill" size={20} tintColor={colors.label} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: space.sm,
    paddingRight: space.sm,
  },
  main: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.xs,
  },
  text: { flex: 1, justifyContent: 'center' },
  title: { ...type.subhead, fontWeight: '600', color: colors.label },
  titleInline: { ...type.footnote, fontWeight: '600' },
  subtitle: { ...type.footnote, color: colors.secondaryLabel, marginTop: 1 },
  control: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
  },
  controlPressed: { backgroundColor: colors.fill },
});
