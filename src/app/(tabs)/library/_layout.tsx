import { Stack } from 'expo-router';

import { colors } from '@/theme';

export default function TabStackLayout() {
  return (
    <Stack
      screenOptions={{
        headerLargeTitleEnabled: true,
        headerTransparent: true,
        headerTintColor: colors.accent as string,
        headerBackButtonDisplayMode: 'minimal',
      }}
    />
  );
}
