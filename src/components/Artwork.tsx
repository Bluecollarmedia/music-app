import { Image, type ImageStyle } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { SymbolView } from 'expo-symbols';
import { memo } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { resolveUri } from '@/lib/paths';
import { artworkRadius } from '@/theme';

type Props = {
  /** Artwork path relative to Documents (from the library). */
  path: string | null | undefined;
  size?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
  /** Cross-dissolve duration when the image changes. */
  transitionMs?: number;
  priority?: 'low' | 'normal' | 'high';
  accessibilityLabel?: string;
};

/**
 * Square album artwork. Never stretched: the image always fills a square with `cover`.
 * When a song has no artwork, shows a quiet placeholder instead of an empty box.
 */
export const Artwork = memo(function Artwork({
  path,
  size,
  radius,
  style,
  transitionMs = 200,
  priority = 'normal',
  accessibilityLabel,
}: Props) {
  const uri = resolveUri(path);
  const r = radius ?? (size ? artworkRadius(size) : 10);
  const box: ViewStyle = size ? { width: size, height: size } : { width: '100%', aspectRatio: 1 };

  return (
    <View
      style={[styles.base, box, { borderRadius: r }, style]}
      accessible={!!accessibilityLabel}
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
    >
      {uri ? (
        <Image
          source={{ uri }}
          style={StyleSheet.absoluteFill as StyleProp<ImageStyle>}
          contentFit="cover"
          transition={transitionMs}
          recyclingKey={uri}
          cachePolicy="memory-disk"
          priority={priority}
        />
      ) : (
        <Placeholder size={size} />
      )}
    </View>
  );
});

function Placeholder({ size }: { size?: number }) {
  const glyph = size ? Math.max(14, Math.round(size * 0.36)) : 64;
  return (
    <LinearGradient
      colors={['#3A3A40', '#1E1E22']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[StyleSheet.absoluteFill, styles.center]}
    >
      <SymbolView name="music.note" size={glyph} tintColor="rgba(255,255,255,0.45)" weight="medium" />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  base: {
    overflow: 'hidden',
    backgroundColor: '#1E1E22',
    borderCurve: 'continuous',
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
