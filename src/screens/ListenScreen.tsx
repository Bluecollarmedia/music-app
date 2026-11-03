import { Link, router, Stack } from 'expo-router';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';

import { AlbumTile } from '@/components/AlbumTile';
import { EmptyState } from '@/components/EmptyState';
import { ImportBanner } from '@/components/ImportBanner';
import { LibraryToolbar, runImportFromFiles } from '@/components/LibraryToolbar';
import { PlaylistArtwork } from '@/components/PlaylistArtwork';
import { SectionHeader } from '@/components/SectionHeader';
import { TrackRow } from '@/components/TrackRow';
import { pluralize } from '@/lib/format';
import { useLibrary } from '@/stores/library';
import { player } from '@/stores/player';
import { colors, radius, space, type } from '@/theme';

const SHELF_ITEM = 150;

/** The home screen: what you were listening to, what's new, and quick ways back in. */
export function ListenScreen() {
  const { width } = useWindowDimensions();
  const ready = useLibrary((s) => s.ready);
  const songCount = useLibrary((s) => s.songOrder.length);

  const recentlyPlayed = useLibrary(
    useShallow((s) =>
      Object.values(s.albums)
        .filter((a) => a.lastPlayed)
        .sort((a, b) => (b.lastPlayed ?? 0) - (a.lastPlayed ?? 0))
        .slice(0, 12)
        .map((a) => a.id),
    ),
  );
  const recentlyAdded = useLibrary(
    useShallow((s) =>
      Object.values(s.albums)
        .sort((a, b) => b.dateAdded - a.dateAdded)
        .slice(0, 12)
        .map((a) => a.id),
    ),
  );
  const favoriteSongs = useLibrary(
    useShallow((s) => s.songOrder.filter((id) => s.tracks[id]?.favorite).slice(0, 5)),
  );
  const playlists = useLibrary(useShallow((s) => s.playlistOrder.slice(0, 10)));
  const allSongs = useLibrary((s) => s.songOrder);

  const shortcuts = useMemo(
    () =>
      [
        { title: 'Shuffle All', symbol: 'shuffle', onPress: () => player.playTracks(allSongs, 0, { shuffle: true }) },
        { title: 'Favorites', symbol: 'heart.fill', onPress: () => router.push('/listen/favorites') },
        { title: 'Albums', symbol: 'square.stack.fill', onPress: () => router.push('/library/albums') },
        { title: 'Artists', symbol: 'music.mic', onPress: () => router.push('/library/artists') },
      ] satisfies { title: string; symbol: SFSymbol; onPress: () => void }[],
    [allSongs],
  );

  const shortcutWidth = (width - space.screen * 2 - space.md) / 2;

  return (
    <>
      <Stack.Title large>Listen</Stack.Title>
      <LibraryToolbar />
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
        <ImportBanner />
        {ready && songCount === 0 ? (
          <EmptyState
            symbol="music.note.house"
            title="Your music lives here"
            message="Import songs from the Files app to start your Davesic library. Everything stays on your iPhone."
            action={{ label: 'Import Music', onPress: runImportFromFiles }}
          />
        ) : (
          <>
            <View style={styles.shortcuts}>
              {shortcuts.map((s) => (
                <Pressable
                  key={s.title}
                  onPress={s.onPress}
                  style={({ pressed }) => [styles.shortcut, { width: shortcutWidth }, pressed && styles.pressed]}
                  accessibilityRole="button"
                >
                  <SymbolView name={s.symbol} size={18} tintColor={colors.accent} />
                  <Text style={styles.shortcutText} numberOfLines={1}>
                    {s.title}
                  </Text>
                </Pressable>
              ))}
            </View>

            {recentlyPlayed.length > 0 ? (
              <>
                <SectionHeader title="Recently Played" />
                <Shelf ids={recentlyPlayed} />
              </>
            ) : null}

            <SectionHeader title="Recently Added" href="/listen/recent" />
            <Shelf ids={recentlyAdded} />

            {favoriteSongs.length > 0 ? (
              <>
                <SectionHeader title="Favorite Songs" href="/listen/favorites" />
                {favoriteSongs.map((id, i) => (
                  <TrackRow
                    key={id}
                    trackId={id}
                    subtitle="artist"
                    onPress={() => player.playTracks(favoriteSongs, i)}
                  />
                ))}
              </>
            ) : null}

            {playlists.length > 0 ? (
              <>
                <SectionHeader title="Playlists" href="/listen/playlists" />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.shelf}>
                  {playlists.map((id) => (
                    <PlaylistTile key={id} id={id} />
                  ))}
                </ScrollView>
              </>
            ) : null}
          </>
        )}
      </ScrollView>
    </>
  );
}

function Shelf({ ids }: { ids: string[] }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.shelf}>
      {ids.map((id) => (
        <AlbumTile key={id} albumId={id} width={SHELF_ITEM} />
      ))}
    </ScrollView>
  );
}

function PlaylistTile({ id }: { id: string }) {
  const playlist = useLibrary((s) => s.playlists[id]);
  if (!playlist) return null;
  return (
    <Link href={`/listen/playlist/${id}`} asChild>
      <Pressable style={{ width: SHELF_ITEM }} accessibilityRole="button" accessibilityLabel={playlist.name}>
        <PlaylistArtwork playlistId={id} size={SHELF_ITEM} />
        <Text style={styles.tileTitle} numberOfLines={1}>
          {playlist.name}
        </Text>
        <Text style={styles.tileCaption}>{pluralize(playlist.trackIds.length, 'song')}</Text>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 140 },
  shortcuts: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.md,
    paddingHorizontal: space.screen,
    marginTop: space.md,
  },
  shortcut: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingVertical: space.md + 2,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    backgroundColor: colors.secondaryGroupedBackground,
  },
  pressed: { opacity: 0.7 },
  shortcutText: { ...type.subhead, fontWeight: '600', color: colors.label, flexShrink: 1 },
  shelf: { paddingHorizontal: space.screen, gap: space.lg },
  tileTitle: { ...type.subhead, fontWeight: '500', color: colors.label, marginTop: space.sm },
  tileCaption: { ...type.subhead, color: colors.secondaryLabel, marginTop: 1 },
});
