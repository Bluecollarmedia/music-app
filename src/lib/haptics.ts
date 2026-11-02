import * as Haptics from 'expo-haptics';

/**
 * Haptics are used only where a tactile confirmation helps:
 * favoriting, adding to the queue, finishing a reorder, saving artwork.
 * Never for scrolling, slider movement or ordinary taps.
 */
export const haptics = {
  success: () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}),
  light: () => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}),
  drop: () => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}),
  pickUp: () => void Haptics.selectionAsync().catch(() => {}),
};
