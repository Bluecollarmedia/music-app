import { NativeTabs } from 'expo-router/native-tabs';

import { MiniPlayer } from '@/components/MiniPlayer';
import { usePlayer } from '@/stores/player';
import { colors } from '@/theme';

/**
 * Apple's native tab bar (UITabBarController). On iOS 26 the system renders it in
 * Liquid Glass, minimizes it on scroll, and hosts the mini-player as its bottom accessory.
 */
export default function TabsLayout() {
  const hasTrack = usePlayer((s) => s.trackId != null);

  return (
    <NativeTabs minimizeBehavior="onScrollDown" tintColor={colors.accent}>
      {hasTrack ? (
        <NativeTabs.BottomAccessory>
          <MiniPlayer />
        </NativeTabs.BottomAccessory>
      ) : null}
      <NativeTabs.Trigger name="listen">
        <NativeTabs.Trigger.Icon sf={{ default: 'play.circle', selected: 'play.circle.fill' }} />
        <NativeTabs.Trigger.Label>Listen</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="library">
        <NativeTabs.Trigger.Icon sf={{ default: 'square.stack', selected: 'square.stack.fill' }} />
        <NativeTabs.Trigger.Label>Library</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="search" role="search">
        <NativeTabs.Trigger.Label>Search</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
