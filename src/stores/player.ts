import Storage from 'expo-sqlite/kv-store';
import { create } from 'zustand';

import { resolveUri } from '@/lib/paths';
import {
  getLibrary,
  trackArtworkPath,
  useLibrary,
  type Track,
} from '@/stores/library';
import { useSettings } from '@/stores/settings';
import {
  isAvailable as nativeAvailable,
  SonderAudio,
  type NativeTrack,
  type QueueEntry,
  type RepeatMode,
} from 'sonder-audio';

type PlayerState = {
  available: boolean;
  entries: QueueEntry[];
  index: number;
  trackId: string | null;
  isPlaying: boolean;
  position: number;
  /** When `position` was reported (ms since epoch), for smooth extrapolation. */
  positionAt: number;
  duration: number;
  shuffle: boolean;
  repeatMode: RepeatMode;
  rate: number;
  lastError: string | null;
};

const QUEUE_KEY = 'sonder.queue.v1';

export const usePlayer = create<PlayerState>(() => ({
  available: nativeAvailable,
  entries: [],
  index: -1,
  trackId: null,
  isPlaying: false,
  position: 0,
  positionAt: Date.now(),
  duration: 0,
  shuffle: false,
  repeatMode: 'off',
  rate: 1,
  lastError: null,
}));

export function toNativeTrack(track: Track): NativeTrack {
  const albums = getLibrary().albums;
  return {
    id: track.id,
    uri: resolveUri(track.file) ?? '',
    title: track.title,
    artist: track.artist,
    album: track.album,
    artworkUri: resolveUri(trackArtworkPath(track, albums)),
    duration: track.duration,
  };
}

function nativeTracks(ids: string[]): NativeTrack[] {
  const tracks = getLibrary().tracks;
  return ids.map((id) => tracks[id]).filter((t): t is Track => !!t && !t.missing).map(toNativeTrack);
}

// MARK: Persistence

let persistTimer: ReturnType<typeof setTimeout> | null = null;

function persistQueue() {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    const s = usePlayer.getState();
    const payload = {
      ids: s.entries.map((e) => e.id),
      index: s.index,
      position: currentPosition(),
      shuffle: s.shuffle,
      repeatMode: s.repeatMode,
    };
    void Storage.setItem(QUEUE_KEY, JSON.stringify(payload));
  }, 400);
}

export function currentPosition(): number {
  const s = usePlayer.getState();
  if (!s.isPlaying) return s.position;
  const elapsed = ((Date.now() - s.positionAt) / 1000) * s.rate;
  return Math.min(s.duration || Infinity, s.position + elapsed);
}

// MARK: Setup

let initialized = false;
let lastRecordedEntry: string | null = null;

export async function initPlayer() {
  if (initialized || !nativeAvailable) return;
  initialized = true;

  SonderAudio.addListener('onQueueChange', (e) => {
    usePlayer.setState({ entries: e.entries, index: e.index });
    persistQueue();
  });

  SonderAudio.addListener('onStateChange', (e) => {
    usePlayer.setState({
      isPlaying: e.isPlaying,
      index: e.index,
      trackId: e.trackId ?? null,
      position: e.position,
      positionAt: Date.now(),
      duration: e.duration,
      shuffle: e.shuffle,
      repeatMode: e.repeatMode,
      rate: e.rate,
    });
    if (e.isPlaying && e.entryKey && e.entryKey !== lastRecordedEntry && e.trackId) {
      lastRecordedEntry = e.entryKey;
      getLibrary().recordPlay(e.trackId);
    }
    persistQueue();
  });

  SonderAudio.addListener('onProgress', (e) => {
    usePlayer.setState({ position: e.position, positionAt: Date.now(), duration: e.duration });
  });

  SonderAudio.addListener('onError', (e) => {
    usePlayer.setState({ lastError: e.message });
  });

  // Push audio settings to the engine now and whenever they change.
  const applySettings = (s: ReturnType<typeof useSettings.getState>) => {
    void SonderAudio.setCrossfade(s.crossfade);
    void SonderAudio.setGapless(s.gapless);
    void SonderAudio.setRate(s.rate);
    void SonderAudio.setEqualizer(s.eqEnabled, s.eqGains);
  };
  applySettings(useSettings.getState());
  useSettings.subscribe((s, prev) => {
    if (s.crossfade !== prev.crossfade) void SonderAudio.setCrossfade(s.crossfade);
    if (s.gapless !== prev.gapless) void SonderAudio.setGapless(s.gapless);
    if (s.rate !== prev.rate) void SonderAudio.setRate(s.rate);
    if (s.eqEnabled !== prev.eqEnabled || s.eqGains !== prev.eqGains) {
      void SonderAudio.setEqualizer(s.eqEnabled, s.eqGains);
    }
  });

  // When artwork or song info changes, refresh what the Lock Screen shows.
  useLibrary.subscribe((s, prev) => {
    if (s.artworkVersion === prev.artworkVersion && s.tracks === prev.tracks) return;
    const artworkChanged = s.artworkVersion !== prev.artworkVersion;
    const ids = new Set(usePlayer.getState().entries.map((e) => e.id));
    for (const id of ids) {
      const t = s.tracks[id];
      const old = prev.tracks[id];
      if (!t) continue;
      const infoChanged = !old || old.title !== t.title || old.artist !== t.artist || old.album !== t.album;
      if (artworkChanged || infoChanged) void SonderAudio.updateTrackInfo(toNativeTrack(t));
    }
  });

  // Restore the last session's queue, paused where the user left off.
  try {
    const stored = Storage.getItemSync(QUEUE_KEY);
    if (stored) {
      const saved = JSON.parse(stored) as {
        ids: string[];
        index: number;
        position: number;
        shuffle: boolean;
        repeatMode: RepeatMode;
      };
      const remember = useSettings.getState().rememberShuffleRepeat;
      const tracks = nativeTracks(saved.ids);
      if (remember) {
        await SonderAudio.setRepeatMode(saved.repeatMode ?? 'off');
      }
      if (tracks.length > 0) {
        const index = Math.max(0, Math.min(saved.index, tracks.length - 1));
        await SonderAudio.setQueue(tracks, index, saved.position ?? 0, false);
        if (remember && saved.shuffle) {
          // Keeps the current song; only the songs after it are reshuffled.
          await SonderAudio.setShuffle(true);
        }
      }
    }
  } catch {
    // A bad saved queue should never block launch.
  }
}

// MARK: Actions

function guard(): boolean {
  if (!nativeAvailable) {
    usePlayer.setState({ lastError: 'Playback needs the SONDER development build (it does not run in Expo Go).' });
    return false;
  }
  return true;
}

export const player = {
  async playTracks(ids: string[], startIndex = 0, options?: { shuffle?: boolean }) {
    if (!guard() || ids.length === 0) return;
    const tracks = nativeTracks(ids);
    if (tracks.length === 0) return;
    let start = Math.max(0, Math.min(startIndex, tracks.length - 1));
    if (options?.shuffle !== undefined) {
      await SonderAudio.setShuffle(options.shuffle);
      if (options.shuffle) start = Math.floor(Math.random() * tracks.length);
    }
    lastRecordedEntry = null;
    await SonderAudio.setQueue(tracks, start, 0, true);
  },

  async playNext(ids: string[]) {
    if (!guard()) return;
    await SonderAudio.insertNext(nativeTracks(ids));
  },

  async addToQueue(ids: string[]) {
    if (!guard()) return;
    await SonderAudio.append(nativeTracks(ids));
  },

  toggle() {
    if (!guard()) return;
    const s = usePlayer.getState();
    // Optimistic: the button flips instantly, the engine confirms right after.
    usePlayer.setState({ isPlaying: !s.isPlaying, position: currentPosition(), positionAt: Date.now() });
    void SonderAudio.togglePlayPause();
  },

  next() {
    if (guard()) void SonderAudio.next();
  },

  previous() {
    if (guard()) void SonderAudio.previous();
  },

  seek(seconds: number) {
    if (!guard()) return;
    usePlayer.setState({ position: seconds, positionAt: Date.now() });
    void SonderAudio.seek(seconds);
  },

  toggleShuffle() {
    if (!guard()) return;
    const next = !usePlayer.getState().shuffle;
    usePlayer.setState({ shuffle: next });
    void SonderAudio.setShuffle(next);
  },

  cycleRepeat() {
    if (!guard()) return;
    const order: RepeatMode[] = ['off', 'all', 'one'];
    const current = usePlayer.getState().repeatMode;
    const next = order[(order.indexOf(current) + 1) % order.length];
    usePlayer.setState({ repeatMode: next });
    void SonderAudio.setRepeatMode(next);
  },

  move(from: number, to: number) {
    if (!guard()) return;
    // Reorder locally first so the list doesn't jump back while the engine confirms.
    const entries = [...usePlayer.getState().entries];
    const [moved] = entries.splice(from, 1);
    entries.splice(to, 0, moved);
    usePlayer.setState({ entries });
    void SonderAudio.move(from, to);
  },

  remove(position: number) {
    if (guard()) void SonderAudio.remove(position);
  },

  clearUpNext() {
    if (guard()) void SonderAudio.clearUpNext();
  },

  skipTo(position: number) {
    if (guard()) void SonderAudio.skipTo(position);
  },
};
