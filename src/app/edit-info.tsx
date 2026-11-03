import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View, type KeyboardTypeOptions } from 'react-native';

import { formatBytes, formatTime } from '@/lib/format';
import { useLibrary } from '@/stores/library';
import { colors, radius, space, type } from '@/theme';

/** Fix missing or wrong tags. Changes are stored in SONDER's library; the file isn't rewritten. */
export default function EditInfoScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const track = useLibrary((s) => s.tracks[id]);
  const [form, setForm] = useState(() => ({
    title: track?.title ?? '',
    artist: track?.artist ?? '',
    album: track?.album ?? '',
    albumArtist: track?.albumArtist ?? '',
    genre: track?.genre ?? '',
    year: track?.year ? String(track.year) : '',
    trackNumber: track?.trackNumber ? String(track.trackNumber) : '',
    discNumber: track?.discNumber ? String(track.discNumber) : '',
  }));

  if (!track) return null;

  const toInt = (v: string) => {
    const n = parseInt(v, 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  };

  const save = async () => {
    await useLibrary.getState().updateTrackInfo(id, {
      title: form.title,
      artist: form.artist,
      album: form.album,
      albumArtist: form.albumArtist || null,
      genre: form.genre || null,
      year: toInt(form.year),
      trackNumber: toInt(form.trackNumber),
      discNumber: toInt(form.discNumber),
    });
    router.back();
  };

  const field = (key: keyof typeof form, label: string, keyboardType: KeyboardTypeOptions = 'default') => (
    <View style={styles.field} key={key}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={form[key]}
        onChangeText={(v) => setForm((f) => ({ ...f, [key]: v }))}
        style={styles.input}
        placeholder={label}
        placeholderTextColor={colors.tertiaryLabel}
        keyboardType={keyboardType}
        clearButtonMode="while-editing"
        accessibilityLabel={label}
      />
    </View>
  );

  return (
    <>
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button onPress={() => router.back()}>Cancel</Stack.Toolbar.Button>
      </Stack.Toolbar>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button variant="done" onPress={save}>
          Save
        </Stack.Toolbar.Button>
      </Stack.Toolbar>
      <ScrollView
        style={{ backgroundColor: colors.groupedBackground }}
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode="interactive"
      >
        <View style={styles.group}>
          {field('title', 'Title')}
          {field('artist', 'Artist')}
          {field('album', 'Album')}
          {field('albumArtist', 'Album Artist')}
          {field('genre', 'Genre')}
        </View>
        <View style={styles.group}>
          {field('year', 'Year', 'number-pad')}
          {field('trackNumber', 'Track Number', 'number-pad')}
          {field('discNumber', 'Disc Number', 'number-pad')}
        </View>
        <Text style={styles.footnote}>
          File: {track.file.split('/').pop()} · {formatBytes(track.fileSize)} · {formatTime(track.duration)}
          {'\n'}Edits are saved in Davesic. Your music file isn’t modified.
        </Text>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.screen, gap: space.xl, paddingBottom: 60 },
  group: {
    borderRadius: radius.md,
    borderCurve: 'continuous',
    backgroundColor: colors.secondaryGroupedBackground,
    paddingHorizontal: space.lg,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  label: { ...type.body, color: colors.secondaryLabel, width: 120 },
  input: { ...type.body, color: colors.label, flex: 1, paddingVertical: space.md },
  footnote: { ...type.footnote, color: colors.secondaryLabel, lineHeight: 18 },
});
