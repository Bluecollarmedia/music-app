import { router, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { BrandBackdrop } from '@/components/BrandBackdrop';
import { PlaylistArtwork } from '@/components/PlaylistArtwork';
import { haptics } from '@/lib/haptics';
import { pluralize } from '@/lib/format';
import { promptNewPlaylist } from '@/screens/LibraryScreens';
import { useLibrary } from '@/stores/library';
import { colors, space, type } from '@/theme';

/** Sheet for adding one or more songs to a playlist. */
export default function AddToPlaylistSheet() {
  const { ids } = useLocalSearchParams<{ ids: string }>();
  const trackIds = (ids ?? '').split(',').filter(Boolean);
  const order = useLibrary((s) => s.playlistOrder);
  const playlists = useLibrary((s) => s.playlists);

  const add = async (playlistId: string) => {
    await useLibrary.getState().addToPlaylist(playlistId, trackIds);
    haptics.success();
    router.back();
  };

  return (
    <View style={styles.root}>
      <Text style={styles.heading}>Add {pluralize(trackIds.length, 'song')} to…</Text>
      <FlatList
        data={order}
        keyExtractor={(id) => id}
        contentContainerStyle={{ paddingBottom: 40 }}
        ListHeaderComponent={
          <>
            <BrandBackdrop header="inline" />
            <Pressable
              style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.fill }]}
              onPress={() =>
                promptNewPlaylist(trackIds, () => {
                  haptics.success();
                  router.back();
                })
              }
              accessibilityRole="button"
            >
              <View style={styles.newIcon}>
                <SymbolView name="plus" size={22} tintColor={colors.accent} />
              </View>
              <Text style={[styles.title, { color: colors.accent }]}>New Playlist…</Text>
            </Pressable>
          </>
        }
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.fill }]}
            onPress={() => add(item)}
            accessibilityRole="button"
            accessibilityLabel={`Add to ${playlists[item]?.name}`}
          >
            <PlaylistArtwork playlistId={item} size={48} />
            <View style={{ flex: 1 }}>
              <Text style={styles.title} numberOfLines={1}>
                {playlists[item]?.name}
              </Text>
              <Text style={styles.sub}>{pluralize(playlists[item]?.trackIds.length ?? 0, 'song')}</Text>
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background, paddingTop: space.xxl },
  heading: { ...type.headline, color: colors.label, paddingHorizontal: space.screen, marginBottom: space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.screen, height: 64 },
  newIcon: {
    width: 48,
    height: 48,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.secondaryFill,
  },
  title: { ...type.body, color: colors.label },
  sub: { ...type.subhead, color: colors.secondaryLabel, marginTop: 2 },
});
