import { Link, router, Stack } from 'expo-router';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { useDeferredValue, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useShallow } from 'zustand/react/shallow';

import { AlbumTile } from '@/components/AlbumTile';
import { Artwork } from '@/components/Artwork';
import { BrandBackdrop } from '@/components/BrandBackdrop';
import { Touchable } from '@/components/Touchable';
import { EmptyState } from '@/components/EmptyState';
import { ImportBanner } from '@/components/ImportBanner';
import { LibraryToolbar, runImportFromFiles } from '@/components/LibraryToolbar';
import { PlaylistArtwork } from '@/components/PlaylistArtwork';
import { SectionHeader } from '@/components/SectionHeader';
import { TrackRow } from '@/components/TrackRow';
import { useAlbumArtwork } from '@/hooks/useArtwork';
import { useHrefs, useTab } from '@/hooks/useTab';
import { pluralize, sortKey } from '@/lib/format';
import { albumArtworkPath, useLibrary } from '@/stores/library';
import { player } from '@/stores/player';
import { useSettings, type SongSort } from '@/stores/settings';
import { colors, layout, radius, space, type } from '@/theme';

// MARK: Library home

type Category = { title: string; symbol: SFSymbol; route: string };

/** Library landing page: five simple rows, one per section. */
const CATEGORIES: Category[] = [
  { title: 'Songs', symbol: 'music.note', route: '/library/songs' },
  { title: 'Albums', symbol: 'opticaldisc.fill', route: '/library/albums' },
  { title: 'Artists', symbol: 'person.fill', route: '/library/artists' },
  { title: 'Playlists', symbol: 'music.note.list', route: '/library/playlists' },
  { title: 'Favorites', symbol: 'heart', route: '/library/favorites' },
];

export function LibraryScreen() {
  const ready = useLibrary((s) => s.ready);
  const empty = useLibrary((s) => s.songOrder.length === 0);

  return (
    <>
      <Stack.Title large>Library</Stack.Title>
      <LibraryToolbar />
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ paddingBottom: 140 }}>
        <BrandBackdrop />
        <ImportBanner />
        <View style={styles.categoryList}>
          {CATEGORIES.map((c) => (
            <Link key={c.title} href={c.route as never} asChild>
              <Touchable
                style={styles.categoryRow}
                pressedStyle={styles.categoryRowPressed}
                accessibilityRole="button"
                accessibilityLabel={c.title}
              >
                <View style={styles.categoryIcon}>
                  <SymbolView name={c.symbol} size={24} weight="semibold" tintColor={colors.accent} />
                </View>
                <Text style={styles.categoryTitle} numberOfLines={1}>
                  {c.title}
                </Text>
                <SymbolView name="chevron.right" size={16} weight="semibold" tintColor={colors.secondaryLabel} />
              </Touchable>
            </Link>
          ))}
        </View>
        {ready && empty ? (
          <EmptyState
            symbol="square.stack"
            title="No music yet"
            message="Tap + to import songs from Files, or copy them into “On My iPhone › Davesic” and scan."
            action={{ label: 'Import Music', onPress: runImportFromFiles }}
          />
        ) : null}
      </ScrollView>
    </>
  );
}

// MARK: Albums

export function AlbumsScreen({ mode = 'all' }: { mode?: 'all' | 'recent' | 'played' }) {
  const layoutPref = useSettings((s) => s.albumsLayout);
  const update = useSettings((s) => s.update);
  const albumOrder = useLibrary((s) => s.albumOrder);
  const albums = useLibrary((s) => s.albums);
  const { width } = useWindowDimensions();
  const tileWidth = (width - space.screen * 2 - layout.gridGap) / 2;

  const ids = useMemo(
    () =>
      mode === 'recent'
        ? [...albumOrder].sort((a, b) => (albums[b]?.dateAdded ?? 0) - (albums[a]?.dateAdded ?? 0))
        : mode === 'played'
          ? albumOrder
              .filter((id) => albums[id]?.lastPlayed)
              .sort((a, b) => (albums[b]?.lastPlayed ?? 0) - (albums[a]?.lastPlayed ?? 0))
          : albumOrder,
    [mode, albumOrder, albums],
  );

  const grid = layoutPref === 'grid';

  return (
    <>
      <Stack.Title>{mode === 'recent' ? 'Recently Added' : mode === 'played' ? 'Recently Played' : 'Albums'}</Stack.Title>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          icon={grid ? 'list.bullet' : 'square.grid.2x2'}
          accessibilityLabel={grid ? 'Show as list' : 'Show as grid'}
          onPress={() => update({ albumsLayout: grid ? 'list' : 'grid' })}
        />
      </Stack.Toolbar>
      {grid ? (
        <FlatList
          key="grid"
          data={ids}
          numColumns={2}
          keyExtractor={(id) => id}
          contentInsetAdjustmentBehavior="automatic"
          columnWrapperStyle={{ gap: layout.gridGap, paddingHorizontal: space.screen }}
          contentContainerStyle={{ gap: space.xl, paddingTop: space.md, paddingBottom: 140 }}
          ListHeaderComponent={<BrandBackdrop />}
          renderItem={({ item }) => <AlbumTile albumId={item} width={tileWidth} />}
          initialNumToRender={10}
          windowSize={7}
          ListEmptyComponent={<EmptyState symbol="square.stack" title="No albums" message="Imported music appears here." />}
        />
      ) : (
        <FlatList
          key="list"
          data={ids}
          keyExtractor={(id) => id}
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={{ paddingBottom: 140 }}
          ListHeaderComponent={<BrandBackdrop />}
          renderItem={({ item }) => <AlbumListRow albumId={item} />}
          getItemLayout={(_, index) => ({ length: 76, offset: 76 * index, index })}
          ListEmptyComponent={<EmptyState symbol="square.stack" title="No albums" message="Imported music appears here." />}
        />
      )}
    </>
  );
}

function AlbumListRow({ albumId }: { albumId: string }) {
  const album = useLibrary((s) => s.albums[albumId]);
  const artwork = useAlbumArtwork(albumId);
  const hrefs = useHrefs();
  if (!album) return null;
  return (
    <Link href={hrefs.album(albumId)} asChild>
      <Touchable
        style={styles.listRow}
        pressedStyle={{ backgroundColor: colors.fill }}
        accessibilityLabel={`${album.title}, ${album.artist}`}
      >
        <Artwork path={artwork} size={56} />
        <View style={{ flex: 1 }}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {album.title}
          </Text>
          <Text style={styles.rowSub} numberOfLines={1}>
            {album.artist}
            {album.year ? ` · ${album.year}` : ''}
          </Text>
        </View>
      </Touchable>
    </Link>
  );
}

// MARK: Artists

export function ArtistsScreen() {
  const artistOrder = useLibrary((s) => s.artistOrder);
  const artists = useLibrary((s) => s.artists);
  const [sort, setSort] = useState<'name' | 'songs'>('name');
  const ids = useMemo(
    () =>
      sort === 'name'
        ? artistOrder
        : [...artistOrder].sort((a, b) => (artists[b]?.trackIds.length ?? 0) - (artists[a]?.trackIds.length ?? 0)),
    [sort, artistOrder, artists],
  );
  return (
    <>
      <Stack.Title large>Artists</Stack.Title>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Menu icon="ellipsis" accessibilityLabel="Sort artists">
          <Stack.Toolbar.MenuAction isOn={sort === 'name'} onPress={() => setSort('name')}>
            Name
          </Stack.Toolbar.MenuAction>
          <Stack.Toolbar.MenuAction isOn={sort === 'songs'} onPress={() => setSort('songs')}>
            Most Songs
          </Stack.Toolbar.MenuAction>
        </Stack.Toolbar.Menu>
      </Stack.Toolbar>
      <FlatList
        data={ids}
        keyExtractor={(id) => id}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ paddingBottom: 140 }}
        ListHeaderComponent={<BrandBackdrop />}
        renderItem={({ item }) => <ArtistRow artistId={item} />}
        getItemLayout={(_, index) => ({ length: ARTIST_ROW, offset: ARTIST_ROW * index, index })}
        ListEmptyComponent={<EmptyState symbol="music.mic" title="No artists" message="Imported music appears here." />}
      />
    </>
  );
}

const ARTIST_ROW = 92;

function ArtistRow({ artistId }: { artistId: string }) {
  const artist = useLibrary((s) => s.artists[artistId]);
  const cover = useLibrary((s) => {
    const a = s.artists[artistId];
    return a ? albumArtworkPath(s.albums[a.albumIds[0]]) : null;
  });
  const hrefs = useHrefs();
  if (!artist) return null;
  const albums = artist.albumIds.length;
  return (
    <Link href={hrefs.artist(artistId)} asChild>
      <Touchable
        style={styles.artistRow}
        pressedStyle={{ backgroundColor: colors.fill }}
        accessibilityRole="button"
        accessibilityLabel={`${artist.name}, ${albums > 0 ? `${pluralize(albums, 'album')}, ` : ''}${pluralize(artist.trackIds.length, 'song')}`}
      >
        <View style={styles.artistAvatar}>
          <Artwork path={cover} size={60} radius={30} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.artistName} numberOfLines={1}>
            {artist.name}
          </Text>
          <Text style={styles.artistSub} numberOfLines={1}>
            {albums > 0 ? `${pluralize(albums, 'album')} • ` : ''}
            {pluralize(artist.trackIds.length, 'song')}
          </Text>
        </View>
        <SymbolView name="chevron.right" size={15} weight="semibold" tintColor={colors.tertiaryLabel} />
        <View style={styles.artistSeparator} />
      </Touchable>
    </Link>
  );
}

// MARK: Songs

const SORT_LABELS: Record<SongSort, string> = {
  title: 'Title',
  artist: 'Artist',
  album: 'Album',
  dateAdded: 'Recently Added',
  playCount: 'Most Played',
};

/**
 * All songs in a Spotify-style list. `home` is the Listen tab's main screen: large "Songs"
 * title with import and settings in the toolbar.
 */
export function SongsScreen({ favoritesOnly = false, home = false }: { favoritesOnly?: boolean; home?: boolean }) {
  const ready = useLibrary((s) => s.ready);
  const songOrder = useLibrary((s) => s.songOrder);
  const tracks = useLibrary((s) => s.tracks);
  const sort = useSettings((s) => s.songSort);
  const update = useSettings((s) => s.update);
  const [query, setQuery] = useState('');
  const deferred = useDeferredValue(query);

  const ids = useMemo(() => {
    let list = favoritesOnly ? songOrder.filter((id) => tracks[id]?.favorite) : songOrder;
    const q = deferred.trim().toLocaleLowerCase();
    if (q) {
      list = list.filter((id) => {
        const t = tracks[id];
        return (
          t.title.toLocaleLowerCase().includes(q) ||
          t.artist.toLocaleLowerCase().includes(q) ||
          t.album.toLocaleLowerCase().includes(q)
        );
      });
    }
    if (sort === 'title') return list;
    const sorted = [...list];
    const by = {
      artist: (a: string, b: string) => sortKey(tracks[a].artist).localeCompare(sortKey(tracks[b].artist)),
      album: (a: string, b: string) => sortKey(tracks[a].album).localeCompare(sortKey(tracks[b].album)),
      dateAdded: (a: string, b: string) => tracks[b].dateAdded - tracks[a].dateAdded,
      playCount: (a: string, b: string) => tracks[b].playCount - tracks[a].playCount,
    }[sort];
    return sorted.sort(by);
  }, [favoritesOnly, songOrder, tracks, sort, deferred]);

  return (
    <>
      <Stack.Title large={home}>{favoritesOnly ? 'Favorite Songs' : 'Songs'}</Stack.Title>
      <Stack.SearchBar placeholder="Find in Songs" onChangeText={(e) => setQuery(e.nativeEvent.text)} hideWhenScrolling />
      {home ? <LibraryToolbar /> : null}
      <Stack.Toolbar placement={home ? 'left' : 'right'}>
        <Stack.Toolbar.Menu icon="arrow.up.arrow.down" accessibilityLabel="Sort">
          {(Object.keys(SORT_LABELS) as SongSort[]).map((key) => (
            <Stack.Toolbar.MenuAction key={key} isOn={sort === key} onPress={() => update({ songSort: key })}>
              {SORT_LABELS[key]}
            </Stack.Toolbar.MenuAction>
          ))}
        </Stack.Toolbar.Menu>
      </Stack.Toolbar>
      <FlatList
        data={ids}
        keyExtractor={(id) => id}
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ paddingBottom: 140 }}
        ListHeaderComponent={
          <>
            <BrandBackdrop />
            {home ? <ImportBanner /> : null}
            {ids.length > 0 ? (
              <PlayShuffleBar
                onPlay={() => player.playTracks(ids, 0, { shuffle: false })}
                onShuffle={() => player.playTracks(ids, 0, { shuffle: true })}
              />
            ) : null}
          </>
        }
        renderItem={({ item, index }) => (
          <TrackRow trackId={item} prominent onPress={() => player.playTracks(ids, index, { shuffle: false })} />
        )}
        initialNumToRender={14}
        windowSize={9}
        ListEmptyComponent={
          home && ready && songOrder.length === 0 ? (
            <EmptyState
              symbol="music.note.house"
              title="Your music lives here"
              message="Import songs from the Files app to start your Davesic library. Everything stays on your iPhone."
              action={{ label: 'Import Music', onPress: runImportFromFiles }}
            />
          ) : favoritesOnly ? (
            <EmptyState symbol="heart" title="No favorites yet" message="Tap the heart in Now Playing to save songs here." />
          ) : (
            <EmptyState symbol="music.note" title="No songs" message="Imported music appears here." />
          )
        }
      />
    </>
  );
}

// MARK: Playlists

export function promptNewPlaylist(trackIds: string[] = [], onCreated?: (id: string) => void) {
  Alert.prompt(
    'New Playlist',
    undefined,
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Create',
        onPress: async (name?: string) => {
          const id = await useLibrary.getState().createPlaylist(name ?? '', trackIds);
          onCreated?.(id);
        },
      },
    ],
    'plain-text',
    '',
  );
}

export function PlaylistsScreen() {
  const order = useLibrary((s) => s.playlistOrder);
  const tab = useTab();
  return (
    <>
      <Stack.Title>Playlists</Stack.Title>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          icon="plus"
          accessibilityLabel="New Playlist"
          onPress={() => promptNewPlaylist([], (id) => router.push(`/${tab}/playlist/${id}`))}
        />
      </Stack.Toolbar>
      <FlatList
        data={order}
        keyExtractor={(id) => id}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ paddingBottom: 140 }}
        ListHeaderComponent={<BrandBackdrop />}
          renderItem={({ item }) => <PlaylistRow playlistId={item} />}
        ListEmptyComponent={
          <EmptyState
            symbol="music.note.list"
            title="No playlists"
            message="Create a playlist, then add songs from any song’s menu."
            action={{ label: 'New Playlist', onPress: () => promptNewPlaylist() }}
          />
        }
      />
    </>
  );
}

function PlaylistRow({ playlistId }: { playlistId: string }) {
  const playlist = useLibrary((s) => s.playlists[playlistId]);
  const hrefs = useHrefs();
  if (!playlist) return null;
  return (
    <Link href={hrefs.playlist(playlistId)} asChild>
      <Touchable
        style={styles.listRow}
        pressedStyle={{ backgroundColor: colors.fill }}
        accessibilityLabel={playlist.name}
      >
        <PlaylistArtwork playlistId={playlistId} size={56} />
        <View style={{ flex: 1 }}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {playlist.name}
          </Text>
          <Text style={styles.rowSub}>{pluralize(playlist.trackIds.length, 'song')}</Text>
        </View>
        <SymbolView name="chevron.right" size={13} weight="semibold" tintColor={colors.tertiaryLabel} />
      </Touchable>
    </Link>
  );
}

// MARK: Favorites

export function FavoritesScreen() {
  const albumIds = useLibrary(
    useShallow((s) => s.albumOrder.filter((id) => s.albums[id]?.favorite)),
  );
  const songIds = useLibrary(useShallow((s) => s.songOrder.filter((id) => s.tracks[id]?.favorite)));
  return (
    <>
      <Stack.Title>Favorites</Stack.Title>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ paddingBottom: 140 }}>
        <BrandBackdrop />
        {albumIds.length === 0 && songIds.length === 0 ? (
          <EmptyState
            symbol="heart"
            title="No favorites yet"
            message="Favorite songs from Now Playing or any song’s menu, and albums from their page."
          />
        ) : null}
        {albumIds.length > 0 ? (
          <>
            <SectionHeader title="Albums" />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.shelf}>
              {albumIds.map((id) => (
                <AlbumTile key={id} albumId={id} width={150} />
              ))}
            </ScrollView>
          </>
        ) : null}
        {songIds.length > 0 ? (
          <>
            <SectionHeader title="Songs" />
            <PlayShuffleBar
              onPlay={() => player.playTracks(songIds, 0, { shuffle: false })}
              onShuffle={() => player.playTracks(songIds, 0, { shuffle: true })}
            />
            {songIds.map((id, i) => (
              <TrackRow
                key={id}
                trackId={id}
                prominent
                onPress={() => player.playTracks(songIds, i, { shuffle: false })}
              />
            ))}
          </>
        ) : null}
      </ScrollView>
    </>
  );
}

// MARK: Shared

export function PlayShuffleBar({ onPlay, onShuffle }: { onPlay: () => void; onShuffle: () => void }) {
  return (
    <View style={styles.playBar}>
      <Pressable
        onPress={onPlay}
        style={({ pressed }) => [styles.playButton, pressed && { opacity: 0.75 }]}
        accessibilityRole="button"
        accessibilityLabel="Play"
      >
        <SymbolView name="play.fill" size={15} tintColor={colors.accent} />
        <Text style={styles.playText}>Play</Text>
      </Pressable>
      <Pressable
        onPress={onShuffle}
        style={({ pressed }) => [styles.playButton, pressed && { opacity: 0.75 }]}
        accessibilityRole="button"
        accessibilityLabel="Shuffle"
      >
        <SymbolView name="shuffle" size={15} tintColor={colors.accent} />
        <Text style={styles.playText}>Shuffle</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  categoryList: {
    gap: 10,
    paddingHorizontal: space.screen,
    marginTop: space.sm,
    marginBottom: space.lg,
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 64,
    paddingHorizontal: space.lg,
    gap: space.lg,
    borderRadius: 18,
    borderCurve: 'continuous',
    backgroundColor: colors.secondaryGroupedBackground,
  },
  categoryRowPressed: { opacity: 0.7, transform: [{ scale: 0.985 }] },
  categoryIcon: { width: 30, alignItems: 'center', justifyContent: 'center' },
  categoryTitle: { fontSize: 19, fontWeight: '600', letterSpacing: -0.3, color: colors.label, flex: 1 },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: layout.gridGap,
    rowGap: space.xl,
    paddingHorizontal: space.screen,
  },
  artistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
    height: ARTIST_ROW,
    paddingHorizontal: space.screen,
  },
  artistAvatar: {
    width: 62,
    height: 62,
    borderRadius: 31,
    padding: 1,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  artistName: { fontSize: 20, fontWeight: '600', letterSpacing: -0.4, color: colors.label },
  artistSub: { ...type.body, color: colors.secondaryLabel, marginTop: 3 },
  artistSeparator: {
    position: 'absolute',
    left: space.screen,
    right: space.screen,
    bottom: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.separator,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    height: 76,
    paddingHorizontal: space.screen,
  },
  rowTitle: { ...type.body, color: colors.label },
  rowSub: { ...type.subhead, color: colors.secondaryLabel, marginTop: 2 },
  shelf: { paddingHorizontal: space.screen, gap: space.lg },
  playBar: {
    flexDirection: 'row',
    gap: space.md,
    paddingHorizontal: space.screen,
    paddingTop: space.md,
    paddingBottom: space.md,
  },
  playButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    height: 48,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    backgroundColor: colors.secondaryGroupedBackground,
  },
  playText: { ...type.headline, color: colors.accent },
});
