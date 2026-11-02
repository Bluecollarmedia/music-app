import { Link, type Href } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, space, type } from '@/theme';

export function SectionHeader({ title, href }: { title: string; href?: Href }) {
  return (
    <View style={styles.row}>
      <Text style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      {href ? (
        <Link href={href} asChild>
          <Pressable hitSlop={12} style={styles.more} accessibilityLabel={`See all ${title}`}>
            <Text style={styles.moreText}>See All</Text>
            <SymbolView name="chevron.right" size={11} weight="semibold" tintColor={colors.secondaryLabel} />
          </Pressable>
        </Link>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.screen,
    marginTop: space.xxl,
    marginBottom: space.md,
  },
  title: { ...type.title3, fontWeight: '700', color: colors.label },
  more: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  moreText: { ...type.subhead, color: colors.secondaryLabel },
});
