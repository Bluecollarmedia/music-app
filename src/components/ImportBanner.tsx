import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { useImport } from '@/library/importer';
import { colors, radius, space, type } from '@/theme';

/** Shows import progress without blocking the library. */
export function ImportBanner() {
  const active = useImport((s) => s.active);
  const done = useImport((s) => s.done);
  const total = useImport((s) => s.total);
  const name = useImport((s) => s.currentName);
  if (!active) return null;
  return (
    <View style={styles.banner} accessibilityLiveRegion="polite">
      <ActivityIndicator />
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>
          Importing {done + 1 > total ? total : done + 1} of {total}
        </Text>
        {name ? (
          <Text style={styles.sub} numberOfLines={1}>
            {name}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    marginHorizontal: space.screen,
    marginTop: space.md,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.secondaryGroupedBackground,
  },
  title: { ...type.subhead, fontWeight: '600', color: colors.label },
  sub: { ...type.footnote, color: colors.secondaryLabel },
});
