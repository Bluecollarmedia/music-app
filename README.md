# SONDER

A local-first music player for iPhone. Your own music files, beautifully organized and played back with a real audio engine.

Built with Expo (SDK 58) and React Native, plus a custom Swift audio module. iOS 26 or later.

## What's inside

- **Native Liquid Glass.** Apple's real tab bar (`NativeTabs` → `UITabBarController`) with the mini-player in the system bottom-accessory slot, minimize-on-scroll, the native search tab, native toolbars, menus and sheets. Floating buttons on Now Playing use `expo-glass-effect` (Apple's `UIGlassEffect`). Content surfaces are deliberately *not* glass.
- **Now Playing.** Square artwork (never stretched), an enlarged and heavily blurred copy of the artwork as the background, cross-dissolving on song changes. Opens from the mini-player with Apple's zoom transition and closes with a swipe down.
- **Real audio engine** (`modules/sonder-audio`, Swift, AVAudioEngine):
  - 10-band equalizer (`AVAudioUnitEQ`) with presets and custom presets
  - Gapless playback and crossfade (two player decks scheduled on the audio clock)
  - Playback speed (`AVAudioUnitTimePitch`, pitch preserved)
  - Lock Screen, Control Center, headphone and AirPlay controls (`MPNowPlayingInfoCenter`, `MPRemoteCommandCenter`, `AVRoutePickerView`)
  - Background audio, interruptions (calls, Siri), headphone unplug, audio-route resets
- **Queue.** Real Up Next: drag to reorder, swipe to remove, clear, play next, add to queue. Changes affect playback order immediately.
- **Library.** Albums (grid or list, remembered), artists, songs (sortable), playlists (create, rename, delete, reorder, mosaic artwork), favorites, recently played and added.
- **Search.** Instant, offline, accent-insensitive across songs, artists, albums and playlists.
- **Importing.** From the Files app, or drop files into "On My iPhone › SONDER" and scan. Tags, duration and artwork are read with AVFoundation. Duplicates are skipped. Missing tags fall back to the file name.
- **Album artwork editing.** Choose from Photos or Files, pinch and drag inside a square frame, live preview at the sizes SONDER uses, save for the whole album or a single song, restore the original. Updates everywhere at once, including the Lock Screen. Audio files are never modified.

## Run it on your iPhone (no Mac needed)

SONDER contains custom native code, so it **does not run in Expo Go**. EAS builds it on Expo's Macs.

One-time setup on your computer (Windows is fine):

```bash
npm install
npm install -g eas-cli
eas login
eas init                 # links the project to your Expo account (commit the app.json change it makes)
eas device:create        # registers your iPhone; open the link it shows on the phone
```

On the iPhone, turn on **Settings › Privacy & Security › Developer Mode** (needed for development and preview builds).

Then pick one:

| Goal | Command | Notes |
|---|---|---|
| Just use the app | `npm run build:preview` | Installs like a normal app from the link EAS gives you. |
| Develop with live reload | `npm run build:dev`, then `npm start` | Install the build once, then open it while your computer runs the dev server on the same Wi-Fi. |
| TestFlight | `npm run build:prod` | Builds and submits to App Store Connect. |

EAS uses your Apple Developer account for signing; it will ask you to sign in to Apple the first time.

## Project layout

```
modules/sonder-audio/      Swift native module: playback engine, EQ, metadata reader, AirPlay picker
src/app/                   Screens (Expo Router). (tabs)/ is the native tab bar; modals live at the root.
src/screens/               Screen implementations shared between tabs
src/components/            Artwork, rows, mini-player, scrubber, draggable list, glass button
src/stores/                library (SQLite-backed), player (mirror of native state), settings
src/library/               importer, artwork editing, shared actions
src/db/                    SQLite schema and queries
src/theme/                 Design tokens
```

The UI never talks to AVAudioEngine directly. The Swift engine owns playback and the queue (so Lock Screen controls work even when the app is in the background) and sends state events; `src/stores/player.ts` mirrors them for the UI.

## Known limitations

- **Formats:** what iOS decodes natively (MP3, AAC/M4A, ALAC, FLAC, WAV, AIFF). OGG/Opus would need a third-party decoder.
- **Volume:** there's no in-app volume slider; use the iPhone's buttons or Control Center.
- **Song info edits** are stored in SONDER's library. Tags inside the music files aren't rewritten.
- **Speed + gapless:** at speeds other than 1×, the hand-off between songs is very close but not sample-exact.
- The Apple zoom transition from the mini-player to Now Playing relies on Expo Router's `Link.AppleZoom` inside the tab bar accessory. If iOS doesn't support zooming from that slot, Now Playing slides up instead.

## Checks

```bash
npm run typecheck
```

`.github/workflows/ios-compile.yml` compiles the full iOS app, including the Swift module, on a GitHub-hosted Mac for every pull request.
