import { useEffect, useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { GestureDetector, usePanGesture, useTapGesture, useSimultaneousGestures } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { formatTime } from '@/lib/format';
import { onArtwork, space, springs, type } from '@/theme';

type Props = {
  position: number;
  duration: number;
  onSeek: (seconds: number) => void;
};

/**
 * Playback progress. The bar thickens while dragging (like the system scrubbers) and
 * seeks once on release, so audio isn't re-seeked dozens of times per drag. No haptics here.
 */
export function Scrubber({ position, duration, onSeek }: Props) {
  const width = useSharedValue(1);
  const progress = useSharedValue(0);
  const dragging = useSharedValue(0);
  const durationSV = useSharedValue(duration);
  const [scrubTime, setScrubTime] = useState<number | null>(null);

  useEffect(() => {
    durationSV.value = duration;
  }, [duration, durationSV]);

  useEffect(() => {
    if (dragging.value === 0 && duration > 0) {
      progress.value = withTiming(Math.min(1, position / duration), { duration: 240 });
    }
  }, [position, duration, dragging, progress]);

  const commit = (fraction: number) => {
    setScrubTime(null);
    onSeek(fraction * durationSV.value);
  };

  const pan = usePanGesture({
    activeOffsetX: [-4, 4],
    onBegin: () => {
      'worklet';
      dragging.value = withSpring(1, springs.press);
    },
    onUpdate: (e) => {
      'worklet';
      const f = Math.max(0, Math.min(1, e.x / width.value));
      progress.value = f;
      scheduleOnRN(setScrubTime, f * durationSV.value);
    },
    onDeactivate: (e) => {
      'worklet';
      const f = Math.max(0, Math.min(1, e.x / width.value));
      scheduleOnRN(commit, f);
    },
    onFinalize: () => {
      'worklet';
      dragging.value = withSpring(0, springs.press);
    },
  });

  const tap = useTapGesture({
    onDeactivate: (e) => {
      'worklet';
      if (e.canceled) return;
      const f = Math.max(0, Math.min(1, e.x / width.value));
      progress.value = withTiming(f, { duration: 120 });
      scheduleOnRN(commit, f);
    },
  });

  const gesture = useSimultaneousGestures(pan, tap);

  const trackStyle = useAnimatedStyle(() => ({
    height: 4 + dragging.value * 4,
    borderRadius: 4,
  }));
  const fillStyle = useAnimatedStyle(() => ({
    width: `${progress.value * 100}%`,
    opacity: 0.85 + dragging.value * 0.15,
  }));

  const shown = scrubTime ?? position;
  const remaining = Math.max(0, duration - shown);

  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel="Playback position"
      accessibilityValue={{ text: `${formatTime(shown)} of ${formatTime(duration)}` }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => {
        const step = 15;
        if (e.nativeEvent.actionName === 'increment') onSeek(Math.min(duration, position + step));
        if (e.nativeEvent.actionName === 'decrement') onSeek(Math.max(0, position - step));
      }}
    >
      <GestureDetector gesture={gesture}>
        <View
          style={styles.hit}
          onLayout={(e: LayoutChangeEvent) => {
            width.value = Math.max(1, e.nativeEvent.layout.width);
          }}
        >
          <Animated.View style={[styles.track, trackStyle]}>
            <Animated.View style={[styles.fill, fillStyle]} />
          </Animated.View>
        </View>
      </GestureDetector>
      <View style={styles.times}>
        <Text style={styles.time}>{formatTime(shown)}</Text>
        <Text style={styles.time}>-{formatTime(remaining)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hit: { height: 28, justifyContent: 'center' },
  track: { backgroundColor: onArtwork.track, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: onArtwork.primary },
  times: { flexDirection: 'row', justifyContent: 'space-between', marginTop: space.xxs },
  time: { ...type.caption, ...type.monoDigits, fontWeight: '500', color: onArtwork.secondary },
});
