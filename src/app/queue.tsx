import { SymbolView, type SFSymbol } from 'expo-symbols';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';

import { Artwork } from '@/components/Artwork';
import { DraggableList } from '@/components/DraggableList';
import { useTrackArtwork } from '@/hooks/useArtwork';
import { useLibrary } from '@/stores/library';
import { player, usePlayer } from '@/stores/player';
import { colors, layout, radius, space, type } from '@/theme';

/** How many upcoming songs are shown as draggable rows; the rest are summarized. */
const VISIBLE_LIMIT = 250;

export default function QueueScreen() {
  const entries = usePlayer((s) => s.entries);
  const index = usePlayer((s) => s.index);
  const trackId = usePlayer((s) => s.trackId);
  const shuffle = usePlayer((s) => s.shuffle);
  const repeatMode = usePlayer((s) => s.repeatMode);
  const [dragging, setDragging] = useState(false);

  const offset = index + 1;
  const upcoming = entries.slice(offset, offset + VISIBLE_LIMIT);
  const hidden = Math.max(0, entries.length - offset - upcoming.length);

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      scrollEnabled={!dragging}
      contentInsetAdjustmentBehavior="automatic"
    >
      <View style={styles.header}>
        <NowPlayingRow trackId={trackId} />
        <View style={styles.pills}>
          <Pill
            symbol="shuffle"
            label="Shuffle"
            active={shuffle}
            onPress={player.toggleShuffle}
          />
          <Pill
            symbol={repeatMode === 'one' ? 'repeat.1' : 'repeat'}
            label={repeatMode === 'one' ? 'Repeat One' : 'Repeat'}
            active={repeatMode !== 'off'}
            onPress={player.cycleRepeat}
          />
        </View>
      </View>

      <View style={styles.sectionRow}>
        <Text style={styles.sectionTitle} accessibilityRole="header">
          Playing Next
        </Text>
        {upcoming.length > 0 ? (
          <Pressable onPress={player.clearUpNext} hitSlop={10} accessibilityRole="button" accessibilityLabel="Clear Playing Next">
            <Text style={styles.clear}>Clear</Text>
          </Pressable>
        ) : null}
      </View>

      {upcoming.length === 0 ? (
        <Text style={styles.empty}>
          Nothing up next. Use “Play Next” or “Add to Queue” from any song’s menu.
        </Text>
      ) : (
        <DraggableList
          items={upcoming}
          keyOf={(e) => e.key}
          rowHeight={layout.rowHeight}
          onMove={(from, to) => player.move(from + offset, to + offset)}
          onRemove={(i) => player.remove(i + offset)}
          onDragStateChange={setDragging}
          renderRow={(entry, i) => (
            <QueueRow trackId={entry.id} onPress={() => player.skipTo(i + offset)} />
          )}
        />
      )}
      {hidden > 0 ? <Text style={styles.more}>and {hidden.toLocaleString()} more</Text> : null}
    </ScrollView>
  );
}

function NowPlayingRow({ trackId }: { trackId: string | null }) {
  const track = useLibrary((s) => (trackId ? s.tracks[trackId] : undefined));
  const artwork = useTrackArtwork(trackId);
  return (
    <View style={styles.nowRow} accessible accessibilityLabel={track ? `Now playing ${track.title} by ${track.artist}` : 'Nothing playing'}>
      <Artwork path={artwork} size={56} />
      <View style={{ flex: 1 }}>
        <Text style={styles.nowTitle} numberOfLines={1}>
          {track?.title ?? 'Not Playing'}
        </Text>
        <Text style={styles.nowArtist} numberOfLines={1}>
          {track?.artist ?? ''}
        </Text>
      </View>
    </View>
  );
}

function QueueRow({ trackId, onPress }: { trackId: string; onPress: () => void }) {
  const track = useLibrary((s) => s.tracks[trackId]);
  const artwork = useTrackArtwork(trackId);
  if (!track) return null;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.fill }]}
      accessibilityRole="button"
      accessibilityLabel={`${track.title}, ${track.artist}`}
      accessibilityHint="Plays this song now. Swipe left to remove."
    >
      <Artwork path={artwork} size={layout.rowArtwork} />
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {track.title}
        </Text>
        <Text style={styles.rowArtist} numberOfLines={1}>
          {track.artist}
        </Text>
      </View>
    </Pressable>
  );
}

function Pill({ symbol, label, active, onPress }: { symbol: SFSymbol; label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.pill, active && styles.pillActive]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
    >
      <SymbolView name={symbol} size={15} weight="semibold" tintColor={active ? '#fff' : colors.label} />
      <Text style={[styles.pillText, active && { color: '#fff' }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { paddingTop: space.xl, paddingBottom: 60 },
  header: { paddingHorizontal: space.screen, gap: space.lg },
  nowRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  nowTitle: { ...type.headline, color: colors.label },
  nowArtist: { ...type.subhead, color: colors.secondaryLabel, marginTop: 2 },
  pills: { flexDirection: 'row', gap: space.sm },
  pill: {
    flex: 1,
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    borderRadius: radius.sm,
    borderCurve: 'continuous',
    backgroundColor: colors.secondaryFill,
  },
  pillActive: { backgroundColor: colors.accent },
  pillText: { ...type.footnote, fontWeight: '600', color: colors.label },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.screen,
    marginTop: space.xxl,
    marginBottom: space.sm,
  },
  sectionTitle: { ...type.headline, color: colors.label },
  clear: { ...type.subhead, color: colors.accent },
  empty: { ...type.subhead, color: colors.secondaryLabel, paddingHorizontal: space.screen, lineHeight: 21 },
  more: { ...type.footnote, color: colors.secondaryLabel, textAlign: 'center', paddingVertical: space.lg },
  row: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingLeft: space.screen,
  },
  rowTitle: { ...type.body, color: colors.label },
  rowArtist: { ...type.subhead, color: colors.secondaryLabel, marginTop: 1 },
});
