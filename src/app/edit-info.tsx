import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View, type KeyboardTypeOptions } from 'react-native';

import { formatBytes, formatTime } from '@/lib/format';
import { useLibrary } from '@/stores/library';
import { colors, radius, space, type } from '@/theme';

/** Fix missing or wrong tags. Changes are stored in Davesic's library; the file isn't rewritten. */
export default function EditInfoScreen() {
  const { id, kind } = useLocalSearchParams<{ id: string; kind?: 'album' | 'track' }>();
  return kind === 'album' ? <EditAlbumInfo id={id} /> : <EditSongInfo id={id} />;
}

/** Album details: title, album artist and cover. Songs keep their own titles, artists and artwork. */
function EditAlbumInfo({ id }: { id: string }) {
  const album = useLibrary((s) => s.albums[id]);
  const [form, setForm] = useState(() => ({ title: album?.title ?? '', artist: album?.artist ?? '' }));
  if (!album) return null;

  const save = async () => {
    await useLibrary.getState().updateAlbumInfo(id, form);
    router.back();
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Edit Album' }} />
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
          <FormField label="Album Title" value={form.title} onChange={(v) => setForm((f) => ({ ...f, title: v }))} />
          <FormField label="Album Artist" value={form.artist} onChange={(v) => setForm((f) => ({ ...f, artist: v }))} />
        </View>
        <Pressable
          style={({ pressed }) => [styles.group, styles.coverRow, pressed && { opacity: 0.6 }]}
          onPress={() => router.push({ pathname: '/artwork-editor', params: { kind: 'album', id } })}
          accessibilityRole="button"
        >
          <Text style={[styles.label, { color: colors.accent, width: undefined }]}>Change Album Cover…</Text>
        </Pressable>
        <Text style={styles.footnote}>
          {album.trackIds.length === 1 ? '1 song' : `${album.trackIds.length} songs`} on this album. Changing the album
          title or cover doesn’t change any song’s title, artist or artwork.
        </Text>
      </ScrollView>
    </>
  );
}

function FormField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        style={styles.input}
        placeholder={label}
        placeholderTextColor={colors.tertiaryLabel}
        clearButtonMode="while-editing"
        accessibilityLabel={label}
      />
    </View>
  );
}

function EditSongInfo({ id }: { id: string }) {
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
        <Pressable
          style={({ pressed }) => [styles.group, styles.coverRow, pressed && { opacity: 0.6 }]}
          onPress={() => router.push({ pathname: '/artwork-editor', params: { kind: 'track', id } })}
          accessibilityRole="button"
        >
          <Text style={[styles.label, { color: colors.accent, width: undefined }]}>Change Song Artwork…</Text>
        </Pressable>
        <View style={styles.group}>
          {field('year', 'Year', 'number-pad')}
          {field('trackNumber', 'Track Number', 'number-pad')}
          {field('discNumber', 'Disc Number', 'number-pad')}
        </View>
        <Text style={styles.footnote}>
          Leave Album empty to keep this song out of albums. Typing an album name adds it to that album.
          {'\n'}File: {track.file.split('/').pop()} · {formatBytes(track.fileSize)} · {formatTime(track.duration)}
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
  coverRow: { minHeight: 48, justifyContent: 'center' },
  footnote: { ...type.footnote, color: colors.secondaryLabel, lineHeight: 18 },
});
