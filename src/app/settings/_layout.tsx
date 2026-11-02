import { Stack } from 'expo-router';

import { colors } from '@/theme';

export default function SettingsLayout() {
  return <Stack screenOptions={{ headerTintColor: colors.accent as string, headerLargeTitleEnabled: false }} />;
}
