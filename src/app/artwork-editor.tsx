import { Image } from 'expo-image';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import {
  GestureDetector,
  usePanGesture,
  usePinchGesture,
  useSimultaneousGestures,
} from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Artwork } from '@/components/Artwork';
import { useAlbumArtwork, useTrackArtwork } from '@/hooks/useArtwork';
import {
  applyAlbumArtworkToAllSongs,
  pickFromFiles,
  pickFromPhotos,
  restoreOriginalArtwork,
  saveArtwork,
  type ArtworkTarget,
  type PickedImage,
} from '@/library/artwork';
import { haptics } from '@/lib/haptics';
import { getLibrary, useLibrary } from '@/stores/library';
import { colors, radius, space, springs, type } from '@/theme';

const MAX_ZOOM = 6;

/**
 * Change an album's (or a single song's) cover.
 * Pick from Photos or Files, position and zoom inside a square frame, preview it at the
 * sizes SONDER uses, then save. Audio files are never modified.
 */
export default function ArtworkEditorScreen() {
  const params = useLocalSearchParams<{ kind: 'album' | 'track'; id: string }>();
  // Opening from a song still edits the whole album by default, so the new cover shows
  // everywhere (album page, library, songs). "This Song" stays one tap away.
  const [target, setTarget] = useState<ArtworkTarget>(() => {
    if (params.kind === 'track') {
      const albumId = getLibrary().tracks[params.id]?.albumId;
      if (albumId && getLibrary().albums[albumId]) return { kind: 'album', id: albumId };
      return { kind: 'track', id: params.id };
    }
    return { kind: 'album', id: params.id };
  });
  const [picked, setPicked] = useState<PickedImage | null>(null);
  const [saving, setSaving] = useState(false);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const viewport = Math.min(width - space.screen * 2, 420);

  const track = useLibrary((s) => (params.kind === 'track' ? s.tracks[params.id] : undefined));
  const album = useLibrary((s) => {
    const albumId = params.kind === 'album' ? params.id : s.tracks[params.id]?.albumId;
    return albumId ? s.albums[albumId] : undefined;
  });
  const albumArtwork = useAlbumArtwork(album?.id);
  const trackArtwork = useTrackArtwork(track?.id);
  const currentArtwork = target.kind === 'track' ? trackArtwork : albumArtwork;
  const hasCustom = target.kind === 'track' ? !!track?.customArtwork : !!album?.customArtwork;
  const songOverrides = useLibrary((s) =>
    album ? album.trackIds.filter((id) => s.tracks[id]?.customArtwork).length : 0,
  );

  // Crop state (shared with the gesture worklets).
  const zoom = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);

  const choose = async (source: 'photos' | 'files') => {
    try {
      const image = source === 'photos' ? await pickFromPhotos() : await pickFromFiles();
      if (!image) return;
      zoom.value = 1;
      tx.value = 0;
      ty.value = 0;
      setPicked(image);
    } catch (e) {
      Alert.alert('Couldn’t open that image', e instanceof Error ? e.message : 'Try a different image.');
    }
  };

  const save = async () => {
    if (!picked) return;
    setSaving(true);
    try {
      const base = viewport / Math.min(picked.width, picked.height);
      const s = base * zoom.value;
      const side = viewport / s;
      const crop = {
        originX: picked.width / 2 - tx.value / s - side / 2,
        originY: picked.height / 2 - ty.value / s - side / 2,
        width: side,
        height: side,
      };
      await saveArtwork(target, picked, crop);
      haptics.success();
      router.back();
    } catch (e) {
      setSaving(false);
      Alert.alert('Couldn’t save artwork', e instanceof Error ? e.message : 'Please try again.');
    }
  };

  const restore = () => {
    Alert.alert(
      'Restore Original Artwork?',
      target.kind === 'album'
        ? 'The artwork embedded in this album’s files will be shown again.'
        : 'This song will use its album’s artwork again.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restore',
          onPress: async () => {
            await restoreOriginalArtwork(target);
            router.back();
          },
        },
      ],
    );
  };

  const subject = target.kind === 'album' ? album?.title : track?.title;

  return (
    <View style={[styles.root, { paddingBottom: insets.bottom }]}>
      <Stack.Screen options={{ headerShown: true, title: picked ? 'Move and Scale' : 'Artwork' }} />
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button onPress={() => (picked ? setPicked(null) : router.back())}>
          {picked ? 'Back' : 'Cancel'}
        </Stack.Toolbar.Button>
      </Stack.Toolbar>
      {picked ? (
        <Stack.Toolbar placement="right">
          <Stack.Toolbar.Button variant="done" onPress={save} disabled={saving}>
            Save
          </Stack.Toolbar.Button>
        </Stack.Toolbar>
      ) : null}

      <ScrollView contentContainerStyle={styles.content} contentInsetAdjustmentBehavior="automatic" scrollEnabled={!picked}>
        {picked ? (
          <>
            <CropView image={picked} viewport={viewport} zoom={zoom} tx={tx} ty={ty} />
            <Text style={styles.hint}>Pinch to zoom and drag to position. The cover is always square.</Text>
            <Text style={styles.previewLabel}>PREVIEW</Text>
            <View style={styles.previews}>
              <PreviewTile image={picked} viewport={viewport} size={120} zoom={zoom} tx={tx} ty={ty} label="Album" />
              <PreviewTile image={picked} viewport={viewport} size={56} zoom={zoom} tx={tx} ty={ty} label="List" />
              <PreviewTile image={picked} viewport={viewport} size={36} zoom={zoom} tx={tx} ty={ty} label="Player" />
            </View>
            {saving ? <ActivityIndicator style={{ marginTop: space.lg }} /> : null}
          </>
        ) : (
          <>
            <View style={styles.currentWrap}>
              <Artwork path={currentArtwork} size={Math.min(viewport, 260)} style={styles.shadow} />
              <Text style={styles.subject} numberOfLines={2}>
                {subject ?? ''}
              </Text>
              <Text style={styles.scope}>
                {target.kind === 'album' ? 'Album artwork' : 'Artwork for this song only'}
              </Text>
            </View>

            {track ? (
              <View style={styles.segment}>
                <SegmentButton
                  label="This Song"
                  active={target.kind === 'track'}
                  onPress={() => setTarget({ kind: 'track', id: track.id })}
                />
                <SegmentButton
                  label="Whole Album"
                  active={target.kind === 'album'}
                  onPress={() => album && setTarget({ kind: 'album', id: album.id })}
                />
              </View>
            ) : null}

            <View style={styles.group}>
              <ActionRow symbol="photo.on.rectangle" label="Choose from Photos" onPress={() => choose('photos')} />
              <Separator />
              <ActionRow symbol="folder" label="Choose from Files" onPress={() => choose('files')} />
              {hasCustom ? (
                <>
                  <Separator />
                  <ActionRow symbol="arrow.uturn.backward" label="Restore Original Artwork" onPress={restore} />
                </>
              ) : null}
              {target.kind === 'album' && songOverrides > 0 ? (
                <>
                  <Separator />
                  <ActionRow
                    symbol="square.stack"
                    label={`Use Album Artwork for All ${songOverrides === 1 ? 'Songs' : `${songOverrides} Songs`}`}
                    onPress={async () => {
                      await applyAlbumArtworkToAllSongs(target.id);
                      haptics.success();
                    }}
                  />
                </>
              ) : null}
            </View>
            <Text style={styles.footnote}>
              Custom artwork is saved inside SONDER and shows everywhere, including the Lock Screen. Your music files
              aren’t changed.
            </Text>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function clampTranslation(value: number, displayed: number, viewport: number) {
  'worklet';
  const limit = Math.max(0, (displayed - viewport) / 2);
  return Math.max(-limit, Math.min(limit, value));
}

function CropView({
  image,
  viewport,
  zoom,
  tx,
  ty,
}: {
  image: PickedImage;
  viewport: number;
  zoom: SharedValue<number>;
  tx: SharedValue<number>;
  ty: SharedValue<number>;
}) {
  const base = viewport / Math.min(image.width, image.height);
  const w = image.width * base;
  const h = image.height * base;
  const startZoom = useSharedValue(1);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);

  const pinch = usePinchGesture({
    onBegin: () => {
      'worklet';
      startZoom.value = zoom.value;
    },
    onUpdate: (e) => {
      'worklet';
      zoom.value = Math.max(1, Math.min(MAX_ZOOM, startZoom.value * e.scale));
      tx.value = clampTranslation(tx.value, w * zoom.value, viewport);
      ty.value = clampTranslation(ty.value, h * zoom.value, viewport);
    },
  });

  const pan = usePanGesture({
    onBegin: () => {
      'worklet';
      startX.value = tx.value;
      startY.value = ty.value;
    },
    onUpdate: (e) => {
      'worklet';
      tx.value = clampTranslation(startX.value + e.translationX, w * zoom.value, viewport);
      ty.value = clampTranslation(startY.value + e.translationY, h * zoom.value, viewport);
    },
    onDeactivate: () => {
      'worklet';
      tx.value = withSpring(tx.value, springs.settle);
      ty.value = withSpring(ty.value, springs.settle);
    },
  });

  const gesture = useSimultaneousGestures(pinch, pan);

  const imageStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: zoom.value }],
  }));

  return (
    <GestureDetector gesture={gesture}>
      <View
        style={[styles.viewport, { width: viewport, height: viewport }]}
        accessible
        accessibilityLabel="Artwork crop area. Pinch to zoom, drag to move."
      >
        <Animated.View style={[{ width: w, height: h }, imageStyle]}>
          <Image source={{ uri: image.uri }} style={{ width: w, height: h }} contentFit="fill" />
        </Animated.View>
        <View pointerEvents="none" style={styles.frame}>
          <View style={[styles.gridLine, { left: '33.33%', top: 0, bottom: 0, width: StyleSheet.hairlineWidth }]} />
          <View style={[styles.gridLine, { left: '66.66%', top: 0, bottom: 0, width: StyleSheet.hairlineWidth }]} />
          <View style={[styles.gridLine, { top: '33.33%', left: 0, right: 0, height: StyleSheet.hairlineWidth }]} />
          <View style={[styles.gridLine, { top: '66.66%', left: 0, right: 0, height: StyleSheet.hairlineWidth }]} />
        </View>
      </View>
    </GestureDetector>
  );
}

/** Live preview: the same crop, drawn at the sizes the app actually uses. */
function PreviewTile({
  image,
  viewport,
  size,
  zoom,
  tx,
  ty,
  label,
}: {
  image: PickedImage;
  viewport: number;
  size: number;
  zoom: SharedValue<number>;
  tx: SharedValue<number>;
  ty: SharedValue<number>;
  label: string;
}) {
  const factor = size / viewport;
  const base = viewport / Math.min(image.width, image.height);
  const w = image.width * base * factor;
  const h = image.height * base * factor;
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value * factor }, { translateY: ty.value * factor }, { scale: zoom.value }],
  }));
  const r = size <= 48 ? 6 : size <= 96 ? 8 : 10;
  return (
    <View style={styles.previewItem}>
      <View style={[styles.previewBox, { width: size, height: size, borderRadius: r }]}>
        <Animated.View style={[{ width: w, height: h }, style]}>
          <Image source={{ uri: image.uri }} style={{ width: w, height: h }} contentFit="fill" />
        </Animated.View>
      </View>
      <Text style={styles.previewCaption}>{label}</Text>
    </View>
  );
}

function SegmentButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.segmentButton, active && styles.segmentActive]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text style={[styles.segmentText, active && { color: colors.label, fontWeight: '600' }]}>{label}</Text>
    </Pressable>
  );
}

function ActionRow({ symbol, label, onPress }: { symbol: SFSymbol; label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.actionRow, pressed && { backgroundColor: colors.fill }]}
      accessibilityRole="button"
    >
      <SymbolView name={symbol} size={20} tintColor={colors.accent} style={{ width: 28 }} />
      <Text style={styles.actionLabel}>{label}</Text>
    </Pressable>
  );
}

function Separator() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.groupedBackground },
  content: { padding: space.screen, alignItems: 'center', paddingBottom: 60 },
  currentWrap: { alignItems: 'center', marginTop: space.md },
  shadow: { shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 20, shadowOffset: { width: 0, height: 10 } },
  subject: { ...type.headline, color: colors.label, marginTop: space.lg, textAlign: 'center' },
  scope: { ...type.footnote, color: colors.secondaryLabel, marginTop: space.xs },
  segment: {
    flexDirection: 'row',
    alignSelf: 'stretch',
    marginTop: space.xl,
    padding: 2,
    borderRadius: radius.sm + 1,
    backgroundColor: colors.secondaryFill,
  },
  segmentButton: { flex: 1, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm - 1 },
  segmentActive: { backgroundColor: colors.secondaryGroupedBackground },
  segmentText: { ...type.footnote, color: colors.secondaryLabel },
  group: {
    alignSelf: 'stretch',
    marginTop: space.xl,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    overflow: 'hidden',
    backgroundColor: colors.secondaryGroupedBackground,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    minHeight: 50,
  },
  actionLabel: { ...type.body, color: colors.label, flex: 1 },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: colors.separator, marginLeft: space.lg + 40 },
  footnote: { ...type.footnote, color: colors.secondaryLabel, marginTop: space.md, paddingHorizontal: space.lg, lineHeight: 18 },
  viewport: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderCurve: 'continuous',
    backgroundColor: '#000',
    marginTop: space.md,
  },
  frame: {
    ...StyleSheet.absoluteFill,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.6)',
    borderRadius: radius.md,
  },
  gridLine: { position: 'absolute', backgroundColor: 'rgba(255,255,255,0.35)' },
  hint: { ...type.footnote, color: colors.secondaryLabel, marginTop: space.md, textAlign: 'center' },
  previewLabel: { ...type.caption, fontWeight: '600', color: colors.secondaryLabel, marginTop: space.xxl, alignSelf: 'flex-start' },
  previews: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: space.xxl,
    alignSelf: 'flex-start',
    marginTop: space.md,
  },
  previewItem: { alignItems: 'center', gap: space.xs },
  previewBox: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: '#000' },
  previewCaption: { ...type.caption2, color: colors.secondaryLabel },
});
