import { Image } from 'expo-image';
import { StyleSheet, useColorScheme, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const backdrop = require('../../assets/brand-backdrop.png');

/**
 * The Davesic logo, enlarged and faded, glowing behind the top of a screen.
 * Put it first inside a scroll view's content (or as a list header): it takes no space,
 * sits behind the rows and scrolls away with them. Shown in dark mode only.
 */
export function BrandBackdrop() {
  const scheme = useColorScheme();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  if (scheme === 'light') return null;

  // Rings centered right of middle, just below the large title, big enough to bleed off the edge.
  const size = width * 2.1;
  const centerX = width * 0.66;
  const centerY = width * 0.36;
  // Content starts below the status bar, navigation bar and large title.
  const contentTop = insets.top + 96;

  return (
    <View pointerEvents="none" style={styles.anchor} importantForAccessibility="no-hide-descendants">
      <Image
        source={backdrop}
        style={{
          position: 'absolute',
          width: size,
          height: size,
          left: centerX - size * 0.5,
          top: centerY - size * 0.478 - contentTop,
          opacity: 0.85,
        }}
        contentFit="contain"
        transition={600}
        accessible={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  anchor: { height: 0, zIndex: -1 },
});
