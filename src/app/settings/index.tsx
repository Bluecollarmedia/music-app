import { Paths } from 'expo-file-system';
import Constants from 'expo-constants';
import { router, Stack } from 'expo-router';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import type { ReactNode } from 'react';
import { ActionSheetIOS, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { runImportFromFiles, runScan } from '@/components/LibraryToolbar';
import { formatBytes, pluralize } from '@/lib/format';
import { useLibrary } from '@/stores/library';
import { allPresets, useSettings, type AppearanceMode } from '@/stores/settings';
import { colors, radius, space, type } from '@/theme';

const CROSSFADE_OPTIONS = [0, 2, 4, 6, 8, 10, 12];
const SPEED_OPTIONS = [0.5, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 2];
const APPEARANCE: { key: AppearanceMode; label: string }[] = [
  { key: 'system', label: 'Automatic' },
  { key: 'dark', label: 'Dark' },
  { key: 'light', label: 'Light' },
];

function pick<T>(title: string, options: { label: string; value: T }[], onPick: (value: T) => void) {
  ActionSheetIOS.showActionSheetWithOptions(
    { title, options: [...options.map((o) => o.label), 'Cancel'], cancelButtonIndex: options.length },
    (i) => {
      if (i < options.length) onPick(options[i].value);
    },
  );
}

export default function SettingsScreen() {
  const s = useSettings();
  const songCount = useLibrary((st) => st.songOrder.length);
  const librarySize = useLibrary((st) => Object.values(st.tracks).reduce((sum, t) => sum + t.fileSize, 0));
  const presetName = allPresets(s.customPresets).find((p) => p.id === s.eqPresetId)?.name ?? 'Custom';

  let available = 0;
  try {
    available = Paths.availableDiskSpace;
  } catch {
    available = 0;
  }

  return (
    <>
      <Stack.Title>Settings</Stack.Title>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button variant="done" onPress={() => router.back()}>
          Done
        </Stack.Toolbar.Button>
      </Stack.Toolbar>
      <ScrollView
        style={{ backgroundColor: colors.groupedBackground }}
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
      >
        <Group title="Playback">
          <Row
            symbol="wave.3.right"
            label="Crossfade"
            value={s.crossfade === 0 ? 'Off' : `${s.crossfade} sec`}
            onPress={() =>
              pick(
                'Crossfade',
                CROSSFADE_OPTIONS.map((v) => ({ label: v === 0 ? 'Off' : `${v} seconds`, value: v })),
                (v) => s.update({ crossfade: v }),
              )
            }
          />
          <Row
            symbol="arrow.right.to.line"
            label="Gapless Playback"
            control={<Switch value={s.gapless} onValueChange={(v) => s.update({ gapless: v })} />}
          />
          <Row
            symbol="gauge.with.dots.needle.50percent"
            label="Playback Speed"
            value={`${s.rate}×`}
            onPress={() =>
              pick(
                'Playback Speed',
                SPEED_OPTIONS.map((v) => ({ label: `${v}×`, value: v })),
                (v) => s.update({ rate: v }),
              )
            }
          />
          <Row
            symbol="shuffle"
            label="Remember Shuffle & Repeat"
            control={
              <Switch value={s.rememberShuffleRepeat} onValueChange={(v) => s.update({ rememberShuffleRepeat: v })} />
            }
            last
          />
        </Group>
        <Footer>
          Gapless playback starts the next song exactly as the current one ends. Crossfade overlaps songs and takes
          priority when it’s on.
        </Footer>

        <Group title="Audio">
          <Row
            symbol="slider.vertical.3"
            label="Equalizer"
            value={s.eqEnabled ? presetName : 'Off'}
            onPress={() => router.push('/settings/equalizer')}
            chevron
            last
          />
        </Group>

        <Group title="Appearance">
          <Row
            symbol="circle.lefthalf.filled"
            label="Appearance"
            value={APPEARANCE.find((a) => a.key === s.appearance)?.label}
            onPress={() =>
              pick(
                'Appearance',
                APPEARANCE.map((a) => ({ label: a.label, value: a.key })),
                (v) => s.update({ appearance: v }),
              )
            }
          />
          <Row
            symbol="photo"
            label="Artwork Background"
            control={<Switch value={s.dynamicBackground} onValueChange={(v) => s.update({ dynamicBackground: v })} />}
          />
          <Row
            symbol="square.grid.2x2"
            label="Albums Layout"
            value={s.albumsLayout === 'grid' ? 'Grid' : 'List'}
            onPress={() => s.update({ albumsLayout: s.albumsLayout === 'grid' ? 'list' : 'grid' })}
            last
          />
        </Group>
        <Footer>Artwork Background fills Now Playing with the colors of the current album cover.</Footer>

        <Group title="Library">
          <Row symbol="folder" label="Import from Files" onPress={runImportFromFiles} chevron />
          <Row symbol="arrow.clockwise" label="Scan SONDER Folder" onPress={runScan} chevron />
          <Row symbol="music.note" label="Songs" value={songCount.toLocaleString()} />
          <Row symbol="internaldrive" label="Music Storage" value={formatBytes(librarySize)} />
          <Row symbol="externaldrive" label="Available on iPhone" value={available ? formatBytes(available) : '—'} last />
        </Group>
        <Footer>
          SONDER plays MP3, AAC/M4A, ALAC, FLAC, WAV and AIFF. You can also copy music into “On My iPhone › SONDER”
          in the Files app, then choose Scan SONDER Folder. {pluralize(songCount, 'song')} stored on this iPhone.
        </Footer>

        <Text style={styles.version}>SONDER {Constants.expoConfig?.version ?? ''}</Text>
      </ScrollView>
    </>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.groupWrap}>
      <Text style={styles.groupTitle} accessibilityRole="header">
        {title.toUpperCase()}
      </Text>
      <View style={styles.group}>{children}</View>
    </View>
  );
}

function Footer({ children }: { children: ReactNode }) {
  return <Text style={styles.footer}>{children}</Text>;
}

function Row({
  symbol,
  label,
  value,
  control,
  onPress,
  chevron,
  last,
}: {
  symbol: SFSymbol;
  label: string;
  value?: string;
  control?: ReactNode;
  onPress?: () => void;
  chevron?: boolean;
  last?: boolean;
}) {
  const content = (
    <>
      <SymbolView name={symbol} size={19} tintColor={colors.accent} style={styles.icon} />
      <Text style={styles.label}>{label}</Text>
      {value ? <Text style={styles.value}>{value}</Text> : null}
      {control}
      {chevron || (onPress && !control && !value) ? (
        <SymbolView name="chevron.right" size={13} weight="semibold" tintColor={colors.tertiaryLabel} />
      ) : null}
      {!last ? <View style={styles.separator} /> : null}
    </>
  );
  if (!onPress) {
    return (
      <View style={styles.row} accessible={!control} accessibilityLabel={value ? `${label}, ${value}` : label}>
        {content}
      </View>
    );
  }
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.fill }]}
      accessibilityRole="button"
      accessibilityLabel={value ? `${label}, ${value}` : label}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: space.screen, paddingBottom: 60 },
  groupWrap: { marginTop: space.xxl },
  groupTitle: { ...type.footnote, color: colors.secondaryLabel, marginLeft: space.lg, marginBottom: space.sm },
  group: {
    borderRadius: radius.md,
    borderCurve: 'continuous',
    overflow: 'hidden',
    backgroundColor: colors.secondaryGroupedBackground,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 48,
    paddingHorizontal: space.lg,
  },
  icon: { width: 26, height: 22 },
  label: { ...type.body, color: colors.label, flex: 1 },
  value: { ...type.body, color: colors.secondaryLabel },
  separator: {
    position: 'absolute',
    left: space.lg + 38,
    right: 0,
    bottom: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.separator,
  },
  footer: { ...type.footnote, color: colors.secondaryLabel, marginTop: space.sm, marginHorizontal: space.lg, lineHeight: 18 },
  version: { ...type.footnote, color: colors.tertiaryLabel, textAlign: 'center', marginTop: space.xxxl },
});
