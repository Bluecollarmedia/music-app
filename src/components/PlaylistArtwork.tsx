import { SymbolView } from 'expo-symbols';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';

import { Artwork } from '@/components/Artwork';
import { usePlaylistArtworks } from '@/hooks/useArtwork';
import { artworkRadius } from '@/theme';

/** A 2×2 mosaic of the playlist's covers, or a single cover when there aren't four. */
export function PlaylistArtwork({ playlistId, size }: { playlistId: string; size: number }) {
  const covers = usePlaylistArtworks(playlistId);
  const r = artworkRadius(size);

  if (covers.length === 0) {
    return (
      <LinearGradient
        colors={['#FF8A5B', '#B4405A']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.center, { width: size, height: size, borderRadius: r }]}
      >
        <SymbolView name="music.note.list" size={size * 0.34} tintColor="rgba(255,255,255,0.9)" />
      </LinearGradient>
    );
  }
  if (covers.length < 4) {
    return <Artwork path={covers[0]} size={size} />;
  }
  const half = size / 2;
  return (
    <View style={[styles.grid, { width: size, height: size, borderRadius: r }]}>
      {covers.map((p) => (
        <Artwork key={p} path={p} size={half} radius={0} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center', borderCurve: 'continuous' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', overflow: 'hidden', borderCurve: 'continuous' },
});
