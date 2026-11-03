import { router, Stack, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useDeferredValue, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { BrandBackdrop } from '@/components/BrandBackdrop';
import { Artwork } from '@/components/Artwork';
import { useTrackArtwork } from '@/hooks/useArtwork';
import { haptics } from '@/lib/haptics';
import { useLibrary } from '@/stores/library';
import { colors, layout, space, type } from '@/theme';

/** Pick songs to add to a playlist, with search. */
export default function AddSongsScreen() {
  const { playlistId } = useLocalSearchParams<{ playlistId: string }>();
  const songOrder = useLibrary((s) => s.songOrder);
  const tracks = useLibrary((s) => s.tracks);
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const deferred = useDeferredValue(query);

  const ids = useMemo(() => {
    const q = deferred.trim().toLocaleLowerCase();
    if (!q) return songOrder;
    return songOrder.filter((id) => {
      const t = tracks[id];
      return `${t.title} ${t.artist} ${t.album}`.toLocaleLowerCase().includes(q);
    });
  }, [deferred, songOrder, tracks]);

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const done = async () => {
    if (selected.length > 0) {
      await useLibrary.getState().addToPlaylist(playlistId, selected);
      haptics.success();
    }
    router.back();
  };

  return (
    <>
      <Stack.SearchBar placeholder="Search Songs" onChangeText={(e) => setQuery(e.nativeEvent.text)} />
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button onPress={() => router.back()}>Cancel</Stack.Toolbar.Button>
      </Stack.Toolbar>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button variant="done" onPress={done}>
          {selected.length > 0 ? `Add (${selected.length})` : 'Done'}
        </Stack.Toolbar.Button>
      </Stack.Toolbar>
      <FlatList
        data={ids}
        keyExtractor={(id) => id}
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode="on-drag"
        ListHeaderComponent={<BrandBackdrop header="inline" />}
        getItemLayout={(_, index) => ({ length: layout.rowHeight, offset: layout.rowHeight * index, index })}
        renderItem={({ item }) => <PickRow id={item} checked={selected.includes(item)} onPress={() => toggle(item)} />}
      />
    </>
  );
}

function PickRow({ id, checked, onPress }: { id: string; checked: boolean; onPress: () => void }) {
  const t = useLibrary((s) => s.tracks[id]);
  const art = useTrackArtwork(id);
  if (!t) return null;
  return (
    <Pressable
      onPress={onPress}
      style={styles.row}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={`${t.title}, ${t.artist}`}
    >
      <Artwork path={art} size={layout.rowArtwork} />
      <View style={{ flex: 1 }}>
        <Text style={styles.title} numberOfLines={1}>
          {t.title}
        </Text>
        <Text style={styles.sub} numberOfLines={1}>
          {t.artist}
        </Text>
      </View>
      <SymbolView
        name={checked ? 'checkmark.circle.fill' : 'circle'}
        size={22}
        tintColor={checked ? colors.accent : colors.tertiaryLabel}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.screen,
    height: layout.rowHeight,
  },
  title: { ...type.body, color: colors.label },
  sub: { ...type.subhead, color: colors.secondaryLabel },
});
