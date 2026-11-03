import Storage from 'expo-sqlite/kv-store';
import { create } from 'zustand';

export type EqPreset = { id: string; name: string; gains: number[]; builtIn?: boolean };

/** Gains in dB for 32, 64, 125, 250, 500, 1k, 2k, 4k, 8k, 16k Hz. */
export const BUILT_IN_PRESETS: EqPreset[] = [
  { id: 'flat', name: 'Flat', gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], builtIn: true },
  { id: 'bass', name: 'Bass Boost', gains: [6, 5, 4, 2, 0, 0, 0, 0, 0, 0], builtIn: true },
  { id: 'treble', name: 'Treble Boost', gains: [0, 0, 0, 0, 0, 1, 2, 4, 5, 6], builtIn: true },
  { id: 'vocal', name: 'Vocal', gains: [-2, -2, -1, 1, 3, 4, 3, 1, 0, -1], builtIn: true },
  { id: 'rock', name: 'Rock', gains: [5, 4, 2, -1, -2, -1, 1, 3, 4, 5], builtIn: true },
  { id: 'electronic', name: 'Electronic', gains: [5, 4, 1, 0, -2, 1, 0, 1, 4, 5], builtIn: true },
  { id: 'hiphop', name: 'Hip-Hop', gains: [5, 4, 1, 3, -1, -1, 1, -1, 2, 3], builtIn: true },
  { id: 'acoustic', name: 'Acoustic', gains: [4, 4, 3, 1, 2, 2, 3, 3, 3, 2], builtIn: true },
  { id: 'late-night', name: 'Late Night', gains: [3, 2, 1, 0, -1, 0, 1, 2, 1, 0], builtIn: true },
];

export type AlbumsLayout = 'grid' | 'list';
export type SongSort = 'title' | 'artist' | 'album' | 'dateAdded' | 'playCount';
export type AppearanceMode = 'system' | 'dark' | 'light';

type PersistedSettings = {
  crossfade: number;
  gapless: boolean;
  rate: number;
  eqEnabled: boolean;
  eqPresetId: string;
  eqGains: number[];
  customPresets: EqPreset[];
  appearance: AppearanceMode;
  dynamicBackground: boolean;
  albumsLayout: AlbumsLayout;
  songSort: SongSort;
  rememberShuffleRepeat: boolean;
};

type SettingsState = PersistedSettings & {
  hydrated: boolean;
  hydrate(): void;
  update(patch: Partial<PersistedSettings>): void;
};

const KEY = 'sonder.settings.v1';

export const DEFAULT_SETTINGS: PersistedSettings = {
  crossfade: 0,
  gapless: true,
  rate: 1,
  eqEnabled: false,
  eqPresetId: 'flat',
  eqGains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  customPresets: [],
  appearance: 'system',
  dynamicBackground: true,
  albumsLayout: 'grid',
  songSort: 'title',
  rememberShuffleRepeat: true,
};

export const useSettings = create<SettingsState>((set, get) => ({
  ...DEFAULT_SETTINGS,
  hydrated: false,

  hydrate() {
    try {
      const stored = Storage.getItemSync(KEY);
      const parsed = stored ? (JSON.parse(stored) as Partial<PersistedSettings>) : {};
      set({ ...DEFAULT_SETTINGS, ...parsed, hydrated: true });
    } catch {
      set({ ...DEFAULT_SETTINGS, hydrated: true });
    }
  },

  update(patch) {
    set(patch);
    const { hydrate: _h, update: _u, hydrated: _hy, ...persisted } = get();
    void Storage.setItem(KEY, JSON.stringify(persisted));
  },
}));

export function allPresets(custom: EqPreset[]): EqPreset[] {
  return [...BUILT_IN_PRESETS, ...custom];
}
