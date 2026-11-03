import { requireNativeView, requireOptionalNativeModule, type EventSubscription } from 'expo';
import type { ComponentType } from 'react';
import type { ColorValue, ViewProps } from 'react-native';

export type RepeatMode = 'off' | 'all' | 'one';

/** What the native engine needs to play a track and show it on the Lock Screen. */
export type NativeTrack = {
  id: string;
  uri: string;
  title: string;
  artist: string;
  album: string;
  artworkUri?: string | null;
  duration: number;
};

export type QueueEntry = { key: string; id: string };

export type PlaybackStateEvent = {
  isPlaying: boolean;
  index: number;
  entryKey?: string;
  trackId?: string;
  position: number;
  duration: number;
  shuffle: boolean;
  repeatMode: RepeatMode;
  rate: number;
};

export type QueueChangeEvent = { entries: QueueEntry[]; index: number };
export type ProgressEvent = { position: number; duration: number };
export type ErrorEvent = { trackId?: string; message: string };

export type FileMetadata = {
  playable?: boolean;
  duration?: number;
  sampleRate?: number;
  channels?: number;
  title?: string;
  artist?: string;
  album?: string;
  albumArtist?: string;
  genre?: string;
  composer?: string;
  year?: number;
  trackNumber?: number;
  discNumber?: number;
  /** file:// URI of the extracted cover, when the file has one. */
  artworkPath?: string;
};

/** Song details written into a shared copy of the song file. */
export type ShareInput = {
  uri: string;
  title: string;
  artist: string;
  album: string;
  albumArtist?: string | null;
  genre?: string | null;
  year?: number | null;
  trackNumber?: number | null;
  discNumber?: number | null;
  artworkUri?: string | null;
};

type SonderAudioEvents = {
  onStateChange: (event: PlaybackStateEvent) => void;
  onQueueChange: (event: QueueChangeEvent) => void;
  onProgress: (event: ProgressEvent) => void;
  onError: (event: ErrorEvent) => void;
};

type SonderAudioNativeModule = {
  equalizerFrequencies: number[];
  getState(): Promise<PlaybackStateEvent & { entries?: QueueEntry[] }>;
  setQueue(tracks: NativeTrack[], startIndex: number, startPosition: number, autoplay: boolean): Promise<void>;
  insertNext(tracks: NativeTrack[]): Promise<void>;
  append(tracks: NativeTrack[]): Promise<void>;
  move(from: number, to: number): Promise<void>;
  remove(position: number): Promise<void>;
  clearUpNext(): Promise<void>;
  skipTo(position: number): Promise<void>;
  updateTrackInfo(track: NativeTrack): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  togglePlayPause(): Promise<void>;
  next(): Promise<void>;
  previous(): Promise<void>;
  seek(seconds: number): Promise<void>;
  setShuffle(enabled: boolean): Promise<void>;
  setRepeatMode(mode: RepeatMode): Promise<void>;
  setRate(rate: number): Promise<void>;
  setCrossfade(seconds: number): Promise<void>;
  setGapless(enabled: boolean): Promise<void>;
  setEqualizer(enabled: boolean, gains: number[]): Promise<void>;
  readMetadata(uri: string, artworkPath: string): Promise<FileMetadata>;
  exportForSharing(input: ShareInput): Promise<string>;
  addListener<K extends keyof SonderAudioEvents>(event: K, listener: SonderAudioEvents[K]): EventSubscription;
};

// Null when running somewhere without the native module (e.g. Expo Go); the app shows a notice instead of crashing.
const nativeModule = requireOptionalNativeModule<SonderAudioNativeModule>('SonderAudio');

export const isAvailable = nativeModule != null;

function mod(): SonderAudioNativeModule {
  if (!nativeModule) {
    throw new Error('SonderAudio native module is not available. Use a SONDER development build, not Expo Go.');
  }
  return nativeModule;
}

export const EQ_FREQUENCIES: number[] = nativeModule?.equalizerFrequencies ?? [
  32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000,
];

export const SonderAudio = {
  getState: () => mod().getState(),
  setQueue: (tracks: NativeTrack[], startIndex: number, startPosition = 0, autoplay = true) =>
    mod().setQueue(tracks, startIndex, startPosition, autoplay),
  insertNext: (tracks: NativeTrack[]) => mod().insertNext(tracks),
  append: (tracks: NativeTrack[]) => mod().append(tracks),
  move: (from: number, to: number) => mod().move(from, to),
  remove: (position: number) => mod().remove(position),
  clearUpNext: () => mod().clearUpNext(),
  skipTo: (position: number) => mod().skipTo(position),
  updateTrackInfo: (track: NativeTrack) => mod().updateTrackInfo(track),
  play: () => mod().play(),
  pause: () => mod().pause(),
  togglePlayPause: () => mod().togglePlayPause(),
  next: () => mod().next(),
  previous: () => mod().previous(),
  seek: (seconds: number) => mod().seek(seconds),
  setShuffle: (enabled: boolean) => mod().setShuffle(enabled),
  setRepeatMode: (mode: RepeatMode) => mod().setRepeatMode(mode),
  setRate: (rate: number) => mod().setRate(rate),
  setCrossfade: (seconds: number) => mod().setCrossfade(seconds),
  setGapless: (enabled: boolean) => mod().setGapless(enabled),
  setEqualizer: (enabled: boolean, gains: number[]) => mod().setEqualizer(enabled, gains),
  readMetadata: (uri: string, artworkPath: string) => mod().readMetadata(uri, artworkPath),
  /** Copies a song with its current details and artwork written in; resolves to the copy's file:// URL. */
  exportForSharing: (input: ShareInput) => mod().exportForSharing(input),
  addListener<K extends keyof SonderAudioEvents>(event: K, listener: SonderAudioEvents[K]): EventSubscription | null {
    return nativeModule ? nativeModule.addListener(event, listener) : null;
  },
};

export type RoutePickerProps = ViewProps & {
  tintColor?: ColorValue;
  activeTintColor?: ColorValue;
};

let NativeRoutePicker: ComponentType<RoutePickerProps> | null = null;
try {
  NativeRoutePicker = nativeModule ? requireNativeView<RoutePickerProps>('SonderAudio') : null;
} catch {
  NativeRoutePicker = null;
}

/** The system AirPlay / Bluetooth output picker (AVRoutePickerView). */
export const RoutePicker = NativeRoutePicker;
