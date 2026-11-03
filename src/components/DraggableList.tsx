import { SymbolView } from 'expo-symbols';
import { useEffect, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { haptics } from '@/lib/haptics';
import { colors, space, springs, type } from '@/theme';

type Props<T> = {
  items: T[];
  keyOf: (item: T) => string;
  rowHeight: number;
  renderRow: (item: T, index: number) => ReactNode;
  onMove: (from: number, to: number) => void;
  /** Enables swipe-left-to-remove. */
  onRemove?: (index: number) => void;
  /** Lets the parent pause scrolling while a row is being dragged. */
  onDragStateChange?: (dragging: boolean) => void;
};

function moveWorklet(positions: Record<string, number>, from: number, to: number) {
  'worklet';
  const next: Record<string, number> = {};
  for (const key in positions) {
    const p = positions[key];
    if (p === from) next[key] = to;
    else if (from < to && p > from && p <= to) next[key] = p - 1;
    else if (from > to && p < from && p >= to) next[key] = p + 1;
    else next[key] = p;
  }
  return next;
}

/**
 * A list whose rows can be reordered by dragging the handle on the right.
 * Rows move with springs as you drag; the drop is confirmed with a single haptic.
 */
export function DraggableList<T>({
  items,
  keyOf,
  rowHeight,
  renderRow,
  onMove,
  onRemove,
  onDragStateChange,
}: Props<T>) {
  const keys = items.map(keyOf);
  const positions = useSharedValue<Record<string, number>>(Object.fromEntries(keys.map((k, i) => [k, i])));
  const keySignature = keys.join('|');

  useEffect(() => {
    positions.value = Object.fromEntries(keys.map((k, i) => [k, i]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keySignature]);

  return (
    <View style={{ height: items.length * rowHeight }}>
      {items.map((item, index) => {
        const key = keyOf(item);
        return (
          <Row
            key={key}
            id={key}
            index={index}
            count={items.length}
            positions={positions}
            rowHeight={rowHeight}
            onMove={onMove}
            onRemove={onRemove}
            onDragStateChange={onDragStateChange}
          >
            {renderRow(item, index)}
          </Row>
        );
      })}
    </View>
  );
}

type RowProps = {
  id: string;
  index: number;
  count: number;
  positions: SharedValue<Record<string, number>>;
  rowHeight: number;
  onMove: (from: number, to: number) => void;
  onRemove?: (index: number) => void;
  onDragStateChange?: (dragging: boolean) => void;
  children: ReactNode;
};

const REMOVE_THRESHOLD = -96;

function Row({ id, index, count, positions, rowHeight, onMove, onRemove, onDragStateChange, children }: RowProps) {
  const top = useSharedValue(index * rowHeight);
  const lifted = useSharedValue(0);
  const startTop = useSharedValue(0);
  const startIndex = useSharedValue(0);
  const swipeX = useSharedValue(0);
  const countSV = useSharedValue(count);

  useEffect(() => {
    countSV.value = count;
  }, [count, countSV]);

  useEffect(() => {
    if (lifted.value === 0) top.value = withSpring(index * rowHeight, springs.settle);
  }, [index, rowHeight, top, lifted]);

  useAnimatedReaction(
    () => positions.value[id],
    (current, previous) => {
      if (current === undefined || current === previous || lifted.value === 1) return;
      top.value = withSpring(current * rowHeight, springs.settle);
    },
  );

  const setDragging = (dragging: boolean) => onDragStateChange?.(dragging);

  const drag = usePanGesture({
    minDistance: 0,
    onActivate: () => {
      'worklet';
      lifted.value = 1;
      startTop.value = top.value;
      startIndex.value = positions.value[id] ?? 0;
      scheduleOnRN(haptics.pickUp);
      scheduleOnRN(setDragging, true);
    },
    onUpdate: (e) => {
      'worklet';
      const maxTop = (countSV.value - 1) * rowHeight;
      top.value = Math.max(0, Math.min(maxTop, startTop.value + e.translationY));
      const target = Math.max(0, Math.min(countSV.value - 1, Math.round(top.value / rowHeight)));
      const current = positions.value[id];
      if (current !== undefined && target !== current) {
        positions.value = moveWorklet(positions.value, current, target);
      }
    },
    onFinalize: () => {
      'worklet';
      if (lifted.value !== 1) return;
      const finalIndex = positions.value[id] ?? startIndex.value;
      top.value = withSpring(finalIndex * rowHeight, springs.settle);
      lifted.value = 0;
      scheduleOnRN(setDragging, false);
      if (finalIndex !== startIndex.value) {
        scheduleOnRN(haptics.drop);
        scheduleOnRN(onMove, startIndex.value, finalIndex);
      }
    },
  });

  const removeAt = () => {
    const position = positions.value[id];
    if (position !== undefined) onRemove?.(position);
  };

  const swipe = usePanGesture({
    enabled: !!onRemove,
    activeOffsetX: [-14, 14],
    failOffsetY: [-10, 10],
    onUpdate: (e) => {
      'worklet';
      swipeX.value = Math.min(0, e.translationX);
    },
    onDeactivate: () => {
      'worklet';
      if (swipeX.value < REMOVE_THRESHOLD) {
        swipeX.value = withTiming(-600, { duration: 180 });
        scheduleOnRN(removeAt);
      } else {
        swipeX.value = withSpring(0, springs.settle);
      }
    },
  });

  const rowStyle = useAnimatedStyle(() => ({
    top: top.value,
    zIndex: lifted.value ? 10 : 0,
    transform: [{ scale: 1 + lifted.value * 0.02 }],
    shadowOpacity: lifted.value * 0.25,
  }));
  const contentStyle = useAnimatedStyle(() => ({ transform: [{ translateX: swipeX.value }] }));
  const removeStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, -swipeX.value / 60) }));

  return (
    <Animated.View style={[styles.row, { height: rowHeight }, rowStyle]}>
      {onRemove ? (
        <Animated.View style={[styles.removeBg, removeStyle]}>
          <Text style={styles.removeText}>Remove</Text>
        </Animated.View>
      ) : null}
      <GestureDetector gesture={swipe}>
        <Animated.View style={[styles.content, contentStyle]}>
          <View style={styles.flex}>{children}</View>
          <GestureDetector gesture={drag}>
            <View
              style={styles.handle}
              accessible
              accessibilityRole="adjustable"
              accessibilityLabel="Reorder"
              accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
              onAccessibilityAction={(e) => {
                const from = positions.value[id] ?? index;
                if (e.nativeEvent.actionName === 'increment' && from < count - 1) onMove(from, from + 1);
                if (e.nativeEvent.actionName === 'decrement' && from > 0) onMove(from, from - 1);
              }}
            >
              <SymbolView name="line.3.horizontal" size={18} tintColor={colors.tertiaryLabel} />
            </View>
          </GestureDetector>
        </Animated.View>
      </GestureDetector>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: {
    position: 'absolute',
    left: 0,
    right: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 14,
  },
  content: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  flex: { flex: 1 },
  handle: {
    width: 52,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingRight: space.xs,
  },
  removeBg: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.destructive,
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingRight: space.xxl,
  },
  removeText: { ...type.headline, color: '#fff' },
});
