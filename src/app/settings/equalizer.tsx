import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { newId } from '@/lib/ids';
import { allPresets, useSettings } from '@/stores/settings';
import { colors, radius, space, type } from '@/theme';
import { EQ_FREQUENCIES, isAvailable, SonderAudio } from 'sonder-audio';

const MAX_DB = 12;
const SLIDER_HEIGHT = 200;

function label(freq: number) {
  return freq >= 1000 ? `${freq / 1000}k` : `${freq}`;
}

/**
 * A real 10-band equalizer: these values drive AVAudioUnitEQ in the playback engine.
 * Changes are heard live while dragging.
 */
export default function EqualizerScreen() {
  const enabled = useSettings((s) => s.eqEnabled);
  const gains = useSettings((s) => s.eqGains);
  const presetId = useSettings((s) => s.eqPresetId);
  const custom = useSettings((s) => s.customPresets);
  const update = useSettings((s) => s.update);
  const presets = allPresets(custom);
  const active = presets.find((p) => p.id === presetId);

  const setBand = (index: number, value: number) => {
    const next = [...useSettings.getState().eqGains];
    next[index] = Math.round(value * 2) / 2;
    update({ eqGains: next, eqPresetId: 'custom', eqEnabled: true });
  };

  const preview = (index: number, value: number) => {
    if (!isAvailable) return;
    const next = [...useSettings.getState().eqGains];
    next[index] = value;
    void SonderAudio.setEqualizer(true, next);
  };

  const saveAsPreset = () =>
    Alert.prompt('Save Preset', 'Name this equalizer setting.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Save',
        onPress: (name?: string) => {
          const preset = { id: newId(), name: name?.trim() || 'My Preset', gains: [...gains] };
          update({ customPresets: [...custom, preset], eqPresetId: preset.id });
        },
      },
    ]);

  const deletePreset = (id: string) =>
    Alert.alert('Delete Preset?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          update({
            customPresets: custom.filter((p) => p.id !== id),
            eqPresetId: presetId === id ? 'custom' : presetId,
          }),
      },
    ]);

  return (
    <>
      <Stack.Title>Equalizer</Stack.Title>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Menu icon="ellipsis" accessibilityLabel="Equalizer options">
          <Stack.Toolbar.MenuAction icon="square.and.arrow.down" onPress={saveAsPreset}>
            Save as Preset…
          </Stack.Toolbar.MenuAction>
          <Stack.Toolbar.MenuAction
            icon="arrow.counterclockwise"
            onPress={() => update({ eqGains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], eqPresetId: 'flat' })}
          >
            Reset to Flat
          </Stack.Toolbar.MenuAction>
          {active && !active.builtIn ? (
            <Stack.Toolbar.MenuAction icon="trash" destructive onPress={() => deletePreset(active.id)}>
              Delete “{active.name}”
            </Stack.Toolbar.MenuAction>
          ) : null}
        </Stack.Toolbar.Menu>
      </Stack.Toolbar>
      <ScrollView
        style={{ backgroundColor: colors.groupedBackground }}
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
      >
        <View style={styles.card}>
          <View style={styles.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.toggleLabel}>Equalizer</Text>
              <Text style={styles.toggleSub}>{enabled ? `Active · ${active?.name ?? 'Custom'}` : 'Off'}</Text>
            </View>
            <Switch value={enabled} onValueChange={(v) => update({ eqEnabled: v })} />
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {presets.map((p) => {
            const selected = p.id === presetId;
            return (
              <Pressable
                key={p.id}
                onPress={() => update({ eqGains: [...p.gains], eqPresetId: p.id, eqEnabled: true })}
                onLongPress={p.builtIn ? undefined : () => deletePreset(p.id)}
                style={[styles.chip, selected && styles.chipActive]}
                accessibilityRole="button"
                accessibilityState={{ selected }}
              >
                <Text style={[styles.chipText, selected && { color: '#fff' }]}>{p.name}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={[styles.card, styles.bands, !enabled && { opacity: 0.45 }]}>
          <View style={styles.scale}>
            <Text style={styles.scaleText}>+12</Text>
            <Text style={styles.scaleText}>0</Text>
            <Text style={styles.scaleText}>−12</Text>
          </View>
          {EQ_FREQUENCIES.map((freq, i) => (
            <BandSlider
              key={freq}
              label={label(freq)}
              value={gains[i] ?? 0}
              onPreview={(v) => preview(i, v)}
              onCommit={(v) => setBand(i, v)}
            />
          ))}
        </View>
        <Text style={styles.footnote}>
          The equalizer applies to everything Davesic plays, on the speaker, headphones, Bluetooth and AirPlay. Boosts
          automatically lower the overall level a little so loud songs don’t distort.
        </Text>
      </ScrollView>
    </>
  );
}

function BandSlider({
  label: text,
  value,
  onPreview,
  onCommit,
}: {
  label: string;
  value: number;
  onPreview: (v: number) => void;
  onCommit: (v: number) => void;
}) {
  const db = useSharedValue(value);
  const start = useSharedValue(0);
  const lastSent = useSharedValue(value);

  useEffect(() => {
    db.value = withTiming(value, { duration: 220 });
  }, [value, db]);

  const pan = usePanGesture({
    minDistance: 0,
    onBegin: () => {
      'worklet';
      start.value = db.value;
    },
    onUpdate: (e) => {
      'worklet';
      const next = Math.max(-MAX_DB, Math.min(MAX_DB, start.value - (e.translationY / SLIDER_HEIGHT) * MAX_DB * 2));
      db.value = next;
      if (Math.abs(next - lastSent.value) >= 0.5) {
        lastSent.value = next;
        scheduleOnRN(onPreview, next);
      }
    },
    onFinalize: () => {
      'worklet';
      scheduleOnRN(onCommit, db.value);
    },
  });

  const fill = useAnimatedStyle(() => {
    const center = SLIDER_HEIGHT / 2;
    const offset = (db.value / MAX_DB) * center;
    return {
      top: offset >= 0 ? center - offset : center,
      height: Math.abs(offset),
    };
  });
  const thumb = useAnimatedStyle(() => ({
    top: SLIDER_HEIGHT / 2 - (db.value / MAX_DB) * (SLIDER_HEIGHT / 2) - 11,
  }));

  return (
    <View style={styles.band}>
      <GestureDetector gesture={pan}>
        <View
          style={styles.sliderHit}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={`${text} hertz`}
          accessibilityValue={{ text: `${value > 0 ? '+' : ''}${value} decibels` }}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={(e) => {
            if (e.nativeEvent.actionName === 'increment') onCommit(Math.min(MAX_DB, value + 1));
            if (e.nativeEvent.actionName === 'decrement') onCommit(Math.max(-MAX_DB, value - 1));
          }}
        >
          <View style={styles.sliderTrack} />
          <View style={styles.zeroLine} />
          <Animated.View style={[styles.sliderFill, fill]} />
          <Animated.View style={[styles.thumb, thumb]} />
        </View>
      </GestureDetector>
      <Text style={styles.bandLabel}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.screen, paddingBottom: 60, gap: space.lg },
  card: {
    borderRadius: radius.md,
    borderCurve: 'continuous',
    backgroundColor: colors.secondaryGroupedBackground,
    padding: space.lg,
  },
  toggleRow: { flexDirection: 'row', alignItems: 'center' },
  toggleLabel: { ...type.body, color: colors.label },
  toggleSub: { ...type.footnote, color: colors.secondaryLabel, marginTop: 2 },
  chips: { gap: space.sm },
  chip: {
    paddingHorizontal: space.lg,
    height: 34,
    borderRadius: radius.capsule,
    justifyContent: 'center',
    backgroundColor: colors.secondaryGroupedBackground,
  },
  chipActive: { backgroundColor: colors.accent },
  chipText: { ...type.subhead, fontWeight: '600', color: colors.label },
  bands: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: space.sm },
  scale: { height: SLIDER_HEIGHT, justifyContent: 'space-between', paddingVertical: 2 },
  scaleText: { ...type.caption2, ...type.monoDigits, color: colors.tertiaryLabel },
  band: { alignItems: 'center', gap: space.sm },
  sliderHit: { width: 26, height: SLIDER_HEIGHT, alignItems: 'center' },
  sliderTrack: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 4,
    borderRadius: 2,
    backgroundColor: colors.secondaryFill,
  },
  zeroLine: {
    position: 'absolute',
    top: SLIDER_HEIGHT / 2,
    width: 12,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.tertiaryLabel,
  },
  sliderFill: { position: 'absolute', width: 4, borderRadius: 2, backgroundColor: colors.accent },
  thumb: {
    position: 'absolute',
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  bandLabel: { ...type.caption2, ...type.monoDigits, color: colors.secondaryLabel },
  footnote: { ...type.footnote, color: colors.secondaryLabel, lineHeight: 18 },
});
