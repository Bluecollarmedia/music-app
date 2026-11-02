import { Link, Stack } from 'expo-router';
import { useDeferredValue, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AlbumTile } from '@/components/AlbumTile';
import { Artwork } from '@/components/Artwork';
import { EmptyState } from '@/components/EmptyState';
import { PlaylistArtwork } from '@/components/PlaylistArtwork';
import { SectionHeader } from '@/components/SectionHeader';
import { TrackRow } from '@/components/TrackRow';
import { pluralize } from '@/lib/format';
import { albumArtworkPath, useLibrary } from '@/stores/library';
import { player } from '@/stores/player';
import { colors, space, type } from '@/theme';

/** Normalizes for accent- and case-insensitive matching ("Beyoncé" matches "beyonce"). */
function norm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase();
}

/** Scores a match: prefix of the whole string > prefix of a word > anywhere. */
function score(haystack: string, q: string): number {
  const h = norm(haystack);
  if (h.startsWith(q)) return 3;
  if (h.includes(` ${q}`)) return 2;
  if (h.includes(q)) return 1;
  return 0;
}

export function SearchScreen() {
  const [query, setQuery] = useState('');
  const deferred = useDeferredValue(query);
  const tracks = useLibrary((s) => s.tracks);
  const songOrder = useLibrary((s) => s.songOrder);
  const albums = useLibrary((s) => s.albums);
  const albumOrder = useLibrary((s) => s.albumOrder);
  const artists = useLibrary((s) => s.artists);
  const artistOrder = useLibrary((s) => s.artistOrder);
  const playlists = useLibrary((s) => s.playlists);
  const playlistOrder = useLibrary((s) => s.playlistOrder);

  const results = useMemo(() => {
    const q = norm(deferred.trim());
    if (!q) return null;
    const rank = <T,>(ids: string[], text: (id: string) => string, limit: number) =>
      ids
        .map((id) => ({ id, s: score(text(id), q) }))
        .filter((r) => r.s > 0)
        .sort((a, b) => b.s - a.s)
        .slice(0, limit)
        .map((r) => r.id);

    const songIds = songOrder
      .map((id) => {
        const t = tracks[id];
        return { id, s: score(t.title, q) * 3 + score(t.artist, q) * 2 + score(t.album, q) };
      })
      .filter((r) => r.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 40)
      .map((r) => r.id);

    return {
      artists: rank(artistOrder, (id) => artists[id].name, 6),
      albums: rank(albumOrder, (id) => `${albums[id].title} ${albums[id].artist}`, 10),
      playlists: rank(playlistOrder, (id) => playlists[id].name, 6),
      songs: songIds,
    };
  }, [deferred, tracks, songOrder, albums, albumOrder, artists, artistOrder, playlists, playlistOrder]);

  const total = results
    ? results.artists.length + results.albums.length + results.playlists.length + results.songs.length
    : 0;

  return (
    <>
      <Stack.Title large>Search</Stack.Title>
      <Stack.SearchBar
        placeholder="Songs, artists, albums, playlists"
        placement="automatic"
        onChangeText={(e) => setQuery(e.nativeEvent.text)}
        onCancelButtonPress={() => setQuery('')}
      />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 140 }}
      >
        {!results ? (
          <EmptyState
            symbol="magnifyingglass"
            title="Search your library"
            message="Find any song, artist, album or playlist instantly. Search works offline."
          />
        ) : total === 0 ? (
          <EmptyState symbol="magnifyingglass" title={`No results for “${query.trim()}”`} message="Check the spelling or try a different word." />
        ) : (
          <>
            {results.artists.length > 0 ? (
              <>
                <SectionHeader title="Artists" />
                {results.artists.map((id) => (
                  <ArtistResult key={id} id={id} />
                ))}
              </>
            ) : null}
            {results.albums.length > 0 ? (
              <>
                <SectionHeader title="Albums" />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.shelf}>
                  {results.albums.map((id) => (
                    <AlbumTile key={id} albumId={id} width={140} />
                  ))}
                </ScrollView>
              </>
            ) : null}
            {results.playlists.length > 0 ? (
              <>
                <SectionHeader title="Playlists" />
                {results.playlists.map((id) => (
                  <Link key={id} href={`/search/playlist/${id}`} asChild>
                    <Pressable style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.fill }]}>
                      <PlaylistArtwork playlistId={id} size={48} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.title} numberOfLines={1}>
                          {playlists[id].name}
                        </Text>
                        <Text style={styles.sub}>{pluralize(playlists[id].trackIds.length, 'song')}</Text>
                      </View>
                    </Pressable>
                  </Link>
                ))}
              </>
            ) : null}
            {results.songs.length > 0 ? (
              <>
                <SectionHeader title="Songs" />
                {results.songs.map((id, i) => (
                  <TrackRow key={id} trackId={id} onPress={() => player.playTracks(results.songs, i, { shuffle: false })} />
                ))}
              </>
            ) : null}
          </>
        )}
      </ScrollView>
    </>
  );
}

function ArtistResult({ id }: { id: string }) {
  const artist = useLibrary((s) => s.artists[id]);
  const cover = useLibrary((s) => {
    const a = s.artists[id];
    return a ? albumArtworkPath(s.albums[a.albumIds[0]]) : null;
  });
  if (!artist) return null;
  return (
    <Link href={`/search/artist/${id}`} asChild>
      <Pressable style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.fill }]}>
        <Artwork path={cover} size={48} radius={24} />
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>
            {artist.name}
          </Text>
          <Text style={styles.sub}>Artist</Text>
        </View>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  shelf: { paddingHorizontal: space.screen, gap: space.lg },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.screen,
    height: 64,
  },
  title: { ...type.body, color: colors.label },
  sub: { ...type.subhead, color: colors.secondaryLabel, marginTop: 2 },
});
