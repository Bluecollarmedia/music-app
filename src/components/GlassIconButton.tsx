import { GlassView } from 'expo-glass-effect';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { Pressable, StyleSheet, type ColorValue } from 'react-native';

type Props = {
  symbol: SFSymbol;
  onPress: () => void;
  accessibilityLabel: string;
  size?: number;
  tint?: ColorValue;
};

/**
 * A round floating control on Apple's native Liquid Glass (UIGlassEffect via expo-glass-effect).
 * Used sparingly: only for controls floating over artwork, never for content surfaces.
 */
export function GlassIconButton({ symbol, onPress, accessibilityLabel, size = 36, tint = '#fff' }: Props) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel} hitSlop={8}>
      <GlassView
        glassEffectStyle="regular"
        isInteractive
        colorScheme="dark"
        style={[styles.glass, { width: size, height: size, borderRadius: size / 2 }]}
      >
        <SymbolView name={symbol} size={size * 0.42} weight="semibold" tintColor={tint} />
      </GlassView>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  glass: { alignItems: 'center', justifyContent: 'center' },
});
