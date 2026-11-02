import { Link, router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { ScrollView as GHScrollView } from 'react-native-gesture-handler';

import { AlbumTile } from '@/components/AlbumTile';
import { Artwork } from '@/components/Artwork';
import { DraggableList } from '@/components/DraggableList';
import { EmptyState } from '@/components/EmptyState';
import { PlaylistArtwork } from '@/components/PlaylistArtwork';
import { SectionHeader } from '@/components/SectionHeader';
import { TrackRow } from '@/components/TrackRow';
import { useAlbumArtwork } from '@/hooks/useArtwork';
import { useHrefs } from '@/hooks/useTab';
import { addToQueue, confirmDeleteTracks, playNext, toggleFavoriteAlbum } from '@/library/actions';
import { restoreOriginalArtwork } from '@/library/artwork';
import { formatDuration, pluralize } from '@/lib/format';
import { artistIdFor, useLibrary } from '@/stores/library';
import { player } from '@/stores/player';
import { colors, layout, space, type } from '@/theme';
import { PlayShuffleBar } from '@/screens/LibraryScreens';

// MARK: Album

export function AlbumScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const album = useLibrary((s) => s.albums[id]);
  const artwork = useAlbumArtwork(id);
  const genre = useLibrary((s) => {
    const a = s.albums[id];
    return a ? s.tracks[a.trackIds[0]]?.genre : null;
  });
  const hrefs = useHrefs();
  const { width } = useWindowDimensions();
  const coverSize = Math.min(280, width - 96);

  if (!album) {
    return <EmptyState symbol="square.stack" title="Album not found" message="It may have been removed from your library." />;
  }

  const multiDisc = new Set(album.trackIds.map((t) => useLibrary.getState().tracks[t]?.discNumber ?? 1)).size > 1;
  const meta = [genre, album.year].filter(Boolean).join(' · ');

  return (
    <>
      <Stack.Title>{''}</Stack.Title>
      <Stack.Screen options={{ headerLargeTitleEnabled: false }} />
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          icon={album.favorite ? 'heart.fill' : 'heart'}
          accessibilityLabel={album.favorite ? 'Remove album from favorites' : 'Favorite album'}
          onPress={() => toggleFavoriteAlbum(id)}
        />
        <Stack.Toolbar.Menu icon="ellipsis" accessibilityLabel="More">
          <Stack.Toolbar.MenuAction icon="text.insert" onPress={() => playNext(album.trackIds)}>
            Play Next
          </Stack.Toolbar.MenuAction>
          <Stack.Toolbar.MenuAction icon="text.append" onPress={() => addToQueue(album.trackIds)}>
            Add to Queue
          </Stack.Toolbar.MenuAction>
          <Stack.Toolbar.MenuAction
            icon="music.note.list"
            onPress={() => router.push({ pathname: '/add-to-playlist', params: { ids: album.trackIds.join(',') } })}
          >
            Add to Playlist…
          </Stack.Toolbar.MenuAction>
          <Stack.Toolbar.MenuAction
            icon="photo"
            onPress={() => router.push({ pathname: '/artwork-editor', params: { kind: 'album', id } })}
          >
            Change Artwork…
          </Stack.Toolbar.MenuAction>
          {album.customArtwork ? (
            <Stack.Toolbar.MenuAction
              icon="arrow.uturn.backward"
              onPress={() => restoreOriginalArtwork({ kind: 'album', id })}
            >
              Restore Original Artwork
            </Stack.Toolbar.MenuAction>
          ) : null}
          <Stack.Toolbar.MenuAction
            icon="trash"
            destructive
            onPress={() => confirmDeleteTracks(album.trackIds, `“${album.title}”`, () => router.back())}
          >
            Delete Album
          </Stack.Toolbar.MenuAction>
        </Stack.Toolbar.Menu>
      </Stack.Toolbar>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ paddingBottom: 140 }}>
        <View style={styles.hero}>
          <Pressable
            onLongPress={() => router.push({ pathname: '/artwork-editor', params: { kind: 'album', id } })}
            accessibilityHint="Touch and hold to change artwork"
          >
            <Artwork
              path={artwork}
              size={coverSize}
              style={styles.cover}
              priority="high"
              accessibilityLabel={`${album.title} artwork`}
            />
          </Pressable>
          <Text style={styles.heroTitle} accessibilityRole="header">
            {album.title}
          </Text>
          <Link href={hrefs.artist(artistIdFor(album.artist))} asChild>
            <Pressable hitSlop={8}>
              <Text style={styles.heroArtist}>{album.artist}</Text>
            </Pressable>
          </Link>
          {meta ? <Text style={styles.heroMeta}>{meta}</Text> : null}
        </View>
        <PlayShuffleBar
          onPlay={() => player.playTracks(album.trackIds, 0, { shuffle: false })}
          onShuffle={() => player.playTracks(album.trackIds, 0, { shuffle: true })}
        />
        <View style={styles.divider} />
        {album.trackIds.map((trackId, i) => {
          const disc = useLibrary.getState().tracks[trackId]?.discNumber ?? 1;
          const prevDisc = i > 0 ? (useLibrary.getState().tracks[album.trackIds[i - 1]]?.discNumber ?? 1) : null;
          return (
            <View key={trackId}>
              {multiDisc && disc !== prevDisc ? <Text style={styles.disc}>Disc {disc}</Text> : null}
              <TrackRow
                trackId={trackId}
                variant="number"
                subtitle="none"
                onPress={() => player.playTracks(album.trackIds, i, { shuffle: false })}
              />
            </View>
          );
        })}
        <Text style={styles.footer}>
          {pluralize(album.trackIds.length, 'song')}, {formatDuration(album.duration)}
        </Text>
      </ScrollView>
    </>
  );
}

// MARK: Artist

export function ArtistScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const artist = useLibrary((s) => s.artists[id]);
  const { width } = useWindowDimensions();
  const [showAll, setShowAll] = useState(false);

  if (!artist) {
    return <EmptyState symbol="music.mic" title="Artist not found" message="They may have been removed from your library." />;
  }
  const tile = (width - space.screen * 2 - layout.gridGap) / 2;
  const songs = showAll ? artist.trackIds : artist.trackIds.slice(0, 8);

  return (
    <>
      <Stack.Title large>{artist.name}</Stack.Title>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ paddingBottom: 140 }}>
        <PlayShuffleBar
          onPlay={() => player.playTracks(artist.trackIds, 0, { shuffle: false })}
          onShuffle={() => player.playTracks(artist.trackIds, 0, { shuffle: true })}
        />
        {artist.albumIds.length > 0 ? (
          <>
            <SectionHeader title="Albums" />
            <View style={styles.grid}>
              {artist.albumIds.map((albumId) => (
                <AlbumTile key={albumId} albumId={albumId} width={tile} caption="year" />
              ))}
            </View>
          </>
        ) : null}
        <SectionHeader title="Songs" />
        {songs.map((trackId) => (
          <TrackRow
            key={trackId}
            trackId={trackId}
            subtitle="artistAlbum"
            onPress={() => player.playTracks(artist.trackIds, artist.trackIds.indexOf(trackId), { shuffle: false })}
          />
        ))}
        {!showAll && artist.trackIds.length > songs.length ? (
          <Pressable onPress={() => setShowAll(true)} style={styles.showAll} accessibilityRole="button">
            <Text style={styles.showAllText}>Show All {artist.trackIds.length} Songs</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </>
  );
}

// MARK: Playlist

export function PlaylistScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const playlist = useLibrary((s) => s.playlists[id]);
  const lib = useLibrary.getState;
  const [editing, setEditing] = useState(false);
  const [dragging, setDragging] = useState(false);

  if (!playlist) {
    return <EmptyState symbol="music.note.list" title="Playlist not found" message="It may have been deleted." />;
  }

  const play = (index: number, shuffle = false) => {
    lib().recordPlaylistPlay(id);
    void player.playTracks(playlist.trackIds, index, { shuffle });
  };

  const rename = () =>
    Alert.prompt(
      'Rename Playlist',
      undefined,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Save', onPress: (name?: string) => lib().renamePlaylist(id, name ?? '') },
      ],
      'plain-text',
      playlist.name,
    );

  const remove = () =>
    Alert.alert(`Delete “${playlist.name}”?`, 'The songs stay in your library.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete Playlist',
        style: 'destructive',
        onPress: async () => {
          router.back();
          await lib().deletePlaylist(id);
        },
      },
    ]);

  // Entries keyed by position so the same song can appear twice.
  const entries = playlist.trackIds.map((trackId, i) => ({ key: `${trackId}:${i}`, trackId }));

  return (
    <>
      <Stack.Title>{''}</Stack.Title>
      <Stack.Screen options={{ headerLargeTitleEnabled: false }} />
      <Stack.Toolbar placement="right">
        {editing ? (
          <Stack.Toolbar.Button variant="done" onPress={() => setEditing(false)}>
            Done
          </Stack.Toolbar.Button>
        ) : (
          <Stack.Toolbar.Menu icon="ellipsis" accessibilityLabel="More">
            <Stack.Toolbar.MenuAction
              icon="plus"
              onPress={() => router.push({ pathname: '/add-songs', params: { playlistId: id } })}
            >
              Add Songs
            </Stack.Toolbar.MenuAction>
            <Stack.Toolbar.MenuAction icon="arrow.up.arrow.down" onPress={() => setEditing(true)}>
              Edit Order
            </Stack.Toolbar.MenuAction>
            <Stack.Toolbar.MenuAction icon="pencil" onPress={rename}>
              Rename
            </Stack.Toolbar.MenuAction>
            <Stack.Toolbar.MenuAction icon="text.append" onPress={() => addToQueue(playlist.trackIds)}>
              Add to Queue
            </Stack.Toolbar.MenuAction>
            <Stack.Toolbar.MenuAction icon="trash" destructive onPress={remove}>
              Delete Playlist
            </Stack.Toolbar.MenuAction>
          </Stack.Toolbar.Menu>
        )}
      </Stack.Toolbar>
      <GHScrollView
        contentInsetAdjustmentBehavior="automatic"
        scrollEnabled={!dragging}
        contentContainerStyle={{ paddingBottom: 140 }}
      >
        <View style={styles.hero}>
          <PlaylistArtwork playlistId={id} size={220} />
          <Text style={styles.heroTitle} accessibilityRole="header">
            {playlist.name}
          </Text>
          <Text style={styles.heroMeta}>{pluralize(playlist.trackIds.length, 'song')}</Text>
        </View>
        {playlist.trackIds.length === 0 ? (
          <EmptyState
            symbol="music.note.list"
            title="This playlist is empty"
            message="Add songs here, or use “Add to Playlist” from any song’s menu."
            action={{ label: 'Add Songs', onPress: () => router.push({ pathname: '/add-songs', params: { playlistId: id } }) }}
          />
        ) : editing ? (
          <DraggableList
            items={entries}
            keyOf={(e) => e.key}
            rowHeight={layout.rowHeight}
            onMove={(from, to) => lib().movePlaylistTrack(id, from, to)}
            onRemove={(index) => lib().removeFromPlaylist(id, index)}
            onDragStateChange={setDragging}
            renderRow={(e) => <TrackRow trackId={e.trackId} subtitle="artist" onPress={() => {}} />}
          />
        ) : (
          <>
            <PlayShuffleBar onPlay={() => play(0)} onShuffle={() => play(0, true)} />
            {entries.map((e, i) => (
              <TrackRow
                key={e.key}
                trackId={e.trackId}
                onPress={() => play(i)}
                onRemove={{ title: 'Remove from Playlist', action: () => lib().removeFromPlaylist(id, i) }}
              />
            ))}
          </>
        )}
      </GHScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  hero: {
    alignItems: 'center',
    paddingHorizontal: space.screen,
    paddingTop: space.md,
    paddingBottom: space.sm,
  },
  cover: {
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
  },
  heroTitle: {
    ...type.title2,
    color: colors.label,
    textAlign: 'center',
    marginTop: space.xl,
  },
  heroArtist: {
    ...type.title3,
    fontWeight: '400',
    color: colors.accent,
    textAlign: 'center',
    marginTop: space.xs,
  },
  heroMeta: {
    ...type.footnote,
    color: colors.secondaryLabel,
    textAlign: 'center',
    marginTop: space.xs,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.separator,
    marginLeft: space.screen,
  },
  disc: {
    ...type.footnote,
    fontWeight: '600',
    color: colors.secondaryLabel,
    paddingHorizontal: space.screen,
    paddingTop: space.lg,
    paddingBottom: space.xs,
  },
  footer: {
    ...type.footnote,
    color: colors.secondaryLabel,
    paddingHorizontal: space.screen,
    paddingTop: space.lg,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: layout.gridGap,
    rowGap: space.xl,
    paddingHorizontal: space.screen,
  },
  showAll: { paddingHorizontal: space.screen, paddingVertical: space.md },
  showAllText: { ...type.body, color: colors.accent },
});
