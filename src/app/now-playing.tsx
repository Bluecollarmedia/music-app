import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { useEffect } from 'react';
import {
  ActionSheetIOS,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type ColorValue,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Artwork } from '@/components/Artwork';
import { GlassIconButton } from '@/components/GlassIconButton';
import { Scrubber } from '@/components/Scrubber';
import { useTrackArtwork } from '@/hooks/useArtwork';
import { usePlaybackPosition } from '@/hooks/usePlaybackPosition';
import { shareTrack, toggleFavoriteTrack } from '@/library/actions';
import { resolveUri } from '@/lib/paths';
import { artistIdFor, useLibrary } from '@/stores/library';
import { player, usePlayer } from '@/stores/player';
import { useSettings } from '@/stores/settings';
import { onArtwork, radius, space, springs, type } from '@/theme';
import { RoutePicker } from 'sonder-audio';

export default function NowPlayingScreen() {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const trackId = usePlayer((s) => s.trackId);
  const isPlaying = usePlayer((s) => s.isPlaying);
  const shuffle = usePlayer((s) => s.shuffle);
  const repeatMode = usePlayer((s) => s.repeatMode);
  const track = useLibrary((s) => (trackId ? s.tracks[trackId] : undefined));
  const artwork = useTrackArtwork(trackId);
  const dynamicBackground = useSettings((s) => s.dynamicBackground);
  const { position, duration } = usePlaybackPosition(250);
  const reduceMotion = useReducedMotion();

  // Artwork size: as wide as the screen allows while leaving room for the controls.
  const artSize = Math.min(width - space.xxxl * 2 + 8, height * 0.42);

  // Apple-style "breathing" artwork: full size while playing, slightly inset while paused.
  const scale = useSharedValue(isPlaying ? 1 : 0.86);
  useEffect(() => {
    scale.value = reduceMotion ? (isPlaying ? 1 : 0.86) : withSpring(isPlaying ? 1 : 0.86, springs.artwork);
  }, [isPlaying, reduceMotion, scale]);
  const artStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const goTo = (path: string) => {
    router.back();
    setTimeout(() => router.push(path as never), 350);
  };

  const showMore = () => {
    if (!track) return;
    const actions: { title: string; run: () => void }[] = [
      { title: 'Add to Playlist…', run: () => router.push({ pathname: '/add-to-playlist', params: { ids: track.id } }) },
      ...(track.albumId ? [{ title: 'Go to Album', run: () => goTo(`/library/album/${track.albumId}`) }] : []),
      { title: 'Go to Artist', run: () => goTo(`/library/artist/${artistIdFor(track.artist)}`) },
      {
        title: 'Change Artwork…',
        run: () => router.push({ pathname: '/artwork-editor', params: { kind: 'track', id: track.id } }),
      },
      { title: 'Song Info…', run: () => router.push({ pathname: '/edit-info', params: { id: track.id } }) },
      { title: 'Share Song…', run: () => void shareTrack(track.id) },
    ];
    const options = [...actions.map((a) => a.title), 'Cancel'];
    ActionSheetIOS.showActionSheetWithOptions(
      { options, cancelButtonIndex: options.length - 1, userInterfaceStyle: 'dark' },
      (i) => actions[i]?.run(),
    );
  };

  const uri = resolveUri(artwork);

  return (
    <View style={styles.root}>
      {/* Atmosphere: the same artwork, enlarged and heavily blurred, so its colors fill the screen. */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {dynamicBackground && uri ? (
          <Image
            source={{ uri }}
            style={[StyleSheet.absoluteFill, styles.bgImage]}
            contentFit="cover"
            blurRadius={80}
            transition={{ duration: 700, effect: 'cross-dissolve' }}
            cachePolicy="memory-disk"
          />
        ) : null}
        <View style={[StyleSheet.absoluteFill, { backgroundColor: dynamicBackground && uri ? onArtwork.scrim : '#141416' }]} />
        <LinearGradient
          colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.18)', 'rgba(0,0,0,0.5)']}
          locations={[0, 0.55, 1]}
          style={StyleSheet.absoluteFill}
        />
      </View>

      <View style={[styles.content, { paddingTop: insets.top + space.sm, paddingBottom: insets.bottom + space.lg }]}>
        <View style={styles.topBar}>
          <GlassIconButton symbol="chevron.down" onPress={() => router.back()} accessibilityLabel="Close Now Playing" />
          <View style={styles.grabber} />
          <GlassIconButton symbol="ellipsis" onPress={showMore} accessibilityLabel="More options" />
        </View>

        <View style={styles.artArea}>
          <Animated.View style={[styles.artShadow, artStyle]}>
              <Artwork
                path={artwork}
                size={artSize}
                radius={radius.lg}
                transitionMs={reduceMotion ? 0 : 350}
                priority="high"
                accessibilityLabel={track ? `Artwork for ${track.title}` : 'No artwork'}
              />
            </Animated.View>
        </View>

        <View style={styles.infoRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title} numberOfLines={2} accessibilityRole="header">
              {track?.title ?? 'Not Playing'}
            </Text>
            <Text style={styles.artist} numberOfLines={1}>
              {track ? track.artist : 'Pick a song from your library'}
            </Text>
          </View>
          {track ? (
            <Pressable
              onPress={() => toggleFavoriteTrack(track.id)}
              hitSlop={10}
              style={styles.favorite}
              accessibilityRole="button"
              accessibilityLabel={track.favorite ? 'Remove from favorites' : 'Favorite'}
              accessibilityState={{ selected: !!track.favorite }}
            >
              <SymbolView
                name={track.favorite ? 'heart.fill' : 'heart'}
                size={22}
                tintColor={track.favorite ? '#FF5C7A' : onArtwork.primary}
              />
            </Pressable>
          ) : null}
        </View>

        <Scrubber position={position} duration={duration || track?.duration || 0} onSeek={player.seek} />

        <View style={styles.transport}>
          <TransportButton symbol="backward.fill" size={30} onPress={player.previous} label="Previous" />
          <TransportButton
            symbol={isPlaying ? 'pause.fill' : 'play.fill'}
            size={44}
            onPress={player.toggle}
            label={isPlaying ? 'Pause' : 'Play'}
            large
          />
          <TransportButton symbol="forward.fill" size={30} onPress={player.next} label="Next" />
        </View>

        <View style={styles.bottomRow}>
          <ToggleButton
            symbol="shuffle"
            active={shuffle}
            onPress={player.toggleShuffle}
            label={shuffle ? 'Shuffle on' : 'Shuffle off'}
          />
          <ToggleButton
            symbol={repeatMode === 'one' ? 'repeat.1' : 'repeat'}
            active={repeatMode !== 'off'}
            onPress={player.cycleRepeat}
            label={repeatMode === 'off' ? 'Repeat off' : repeatMode === 'all' ? 'Repeat all' : 'Repeat one'}
          />
          {RoutePicker ? (
            <View style={styles.iconButton} accessibilityLabel="Audio output" accessible>
              <RoutePicker style={styles.routePicker} tintColor={onArtwork.secondary} activeTintColor="#FFFFFF" />
            </View>
          ) : (
            <View style={styles.iconButton} />
          )}
          <Pressable
            onPress={() => router.push('/queue')}
            style={styles.iconButton}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="Playing Next queue"
          >
            <SymbolView name="list.bullet" size={21} tintColor={onArtwork.secondary} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function TransportButton({
  symbol,
  size,
  onPress,
  label,
  large,
}: {
  symbol: SFSymbol;
  size: number;
  onPress: () => void;
  label: string;
  large?: boolean;
}) {
  const pressed = useSharedValue(0);
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - pressed.value * 0.12 }],
  }));
  // The press highlight fades with opacity. (Building an rgba() string from a spring value
  // crashed the app: near the end of the spring the number turns into "1e-7" notation,
  // which isn't a valid color.)
  const highlight = useAnimatedStyle(() => ({
    opacity: Math.min(1, Math.max(0, pressed.value)),
  }));
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => (pressed.value = withSpring(1, springs.press))}
      onPressOut={() => (pressed.value = withSpring(0, springs.press))}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
    >
      <Animated.View style={[large ? styles.transportLarge : styles.transportSmall, style]}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.pressHighlight, highlight]} />
        <SymbolView name={symbol} size={size} tintColor={onArtwork.primary} />
      </Animated.View>
    </Pressable>
  );
}

function ToggleButton({
  symbol,
  active,
  onPress,
  label,
}: {
  symbol: SFSymbol;
  active: boolean;
  onPress: () => void;
  label: string;
}) {
  const tint: ColorValue = active ? '#141416' : onArtwork.secondary;
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      style={[styles.iconButton, active && styles.iconButtonActive]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
    >
      <SymbolView name={symbol} size={19} weight="semibold" tintColor={tint} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0B0B0D' },
  bgImage: { transform: [{ scale: 1.8 }] },
  content: { flex: 1, paddingHorizontal: space.xxxl - 4 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  grabber: {
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: onArtwork.tertiary,
  },
  artArea: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  artShadow: {
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 18 },
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    marginBottom: space.md,
  },
  title: { ...type.title3, fontWeight: '700', color: onArtwork.primary },
  artist: { ...type.title3, fontWeight: '400', color: onArtwork.secondary, marginTop: 2 },
  favorite: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  transport: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
    marginTop: space.xl,
    marginBottom: space.xl,
  },
  transportSmall: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  transportLarge: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.sm,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButtonActive: { backgroundColor: 'rgba(255,255,255,0.88)' },
  pressHighlight: { borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.12)' },
  routePicker: { width: 30, height: 30 },
});
