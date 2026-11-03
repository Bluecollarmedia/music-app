import { SymbolView, type SFSymbol } from 'expo-symbols';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, space, type } from '@/theme';

type Props = {
  symbol: SFSymbol;
  title: string;
  message: string;
  action?: { label: string; onPress: () => void };
};

export function EmptyState({ symbol, title, message, action }: Props) {
  return (
    <View style={styles.wrap}>
      <SymbolView name={symbol} size={44} tintColor={colors.tertiaryLabel} weight="light" />
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
      {action ? (
        <Pressable
          onPress={action.onPress}
          style={({ pressed }) => [styles.button, pressed && { opacity: 0.8 }]}
          accessibilityRole="button"
        >
          <Text style={styles.buttonText}>{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    paddingHorizontal: space.xxxl,
    paddingVertical: 72,
    gap: space.sm,
  },
  title: { ...type.title3, color: colors.label, marginTop: space.md, textAlign: 'center' },
  message: { ...type.subhead, color: colors.secondaryLabel, textAlign: 'center', lineHeight: 21 },
  button: {
    marginTop: space.lg,
    backgroundColor: colors.accent,
    paddingHorizontal: space.xxl,
    paddingVertical: space.md,
    borderRadius: radius.capsule,
  },
  buttonText: { ...type.headline, color: '#fff' },
});
