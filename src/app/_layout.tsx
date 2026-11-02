import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { Appearance, useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ReducedMotionConfig, ReduceMotion } from 'react-native-reanimated';

import { getDb } from '@/db/database';
import { scanForNewFiles, verifyLibraryFiles } from '@/library/importer';
import { useLibrary } from '@/stores/library';
import { initPlayer } from '@/stores/player';
import { useSettings } from '@/stores/settings';
import { colors } from '@/theme';

void SplashScreen.preventAutoHideAsync().catch(() => {});

function bootstrap() {
  getDb();
  useSettings.getState().hydrate();
  useLibrary.getState().hydrate();
}

export default function RootLayout() {
  // Library and settings load synchronously from SQLite before the first frame.
  useState(bootstrap);
  const appearance = useSettings((s) => s.appearance);
  const scheme = useColorScheme();

  useEffect(() => {
    Appearance.setColorScheme(appearance === 'system' ? 'unspecified' : appearance);
  }, [appearance]);

  useEffect(() => {
    void SplashScreen.hideAsync().catch(() => {});
    void initPlayer();
    // Background housekeeping: notice deleted files and pick up files dropped in via the Files app.
    const t = setTimeout(() => {
      void verifyLibraryFiles().then(() => scanForNewFiles());
    }, 1200);
    return () => clearTimeout(t);
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      {/* Follow the system Reduce Motion setting for every Reanimated animation. */}
      <ReducedMotionConfig mode={ReduceMotion.System} />
      <ThemeProvider
        value={
          scheme === 'dark'
            ? { ...DarkTheme, colors: { ...DarkTheme.colors, primary: colors.accent as string } }
            : { ...DefaultTheme, colors: { ...DefaultTheme.colors, primary: colors.accent as string } }
        }
      >
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen
            name="now-playing"
            options={{
              // The mini-player link uses Apple's zoom transition; this is the fallback.
              animation: 'slide_from_bottom',
              gestureEnabled: true,
              gestureDirection: 'vertical',
              fullScreenGestureEnabled: true,
            }}
          />
          <Stack.Screen
            name="queue"
            options={{
              presentation: 'formSheet',
              sheetAllowedDetents: [0.65, 1],
              sheetGrabberVisible: true,
              sheetCornerRadius: 28,
            }}
          />
          <Stack.Screen
            name="add-to-playlist"
            options={{
              presentation: 'formSheet',
              sheetAllowedDetents: [0.55, 1],
              sheetGrabberVisible: true,
            }}
          />
          <Stack.Screen name="artwork-editor" options={{ presentation: 'modal' }} />
          <Stack.Screen name="edit-info" options={{ presentation: 'modal', headerShown: true, title: 'Song Info' }} />
          <Stack.Screen name="add-songs" options={{ presentation: 'modal', headerShown: true, title: 'Add Songs' }} />
          <Stack.Screen name="settings" options={{ presentation: 'modal' }} />
        </Stack>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
