import AVFoundation
import MediaPlayer
import UIKit

struct QueueTrack {
  var id: String
  var uri: String
  var title: String
  var artist: String
  var album: String
  var artworkUri: String?
  var duration: Double
}

extension QueueTrack {
  init(_ record: QueueTrackRecord) {
    self.init(
      id: record.id,
      uri: record.uri,
      title: record.title,
      artist: record.artist,
      album: record.album,
      artworkUri: record.artworkUri,
      duration: record.duration
    )
  }
}

/// One entry in the play queue. The same track can appear more than once,
/// so every entry gets its own key.
struct QueueEntry {
  let key: String
  var track: QueueTrack

  init(_ track: QueueTrack) {
    self.key = UUID().uuidString
    self.track = track
  }
}

/// SONDER's playback engine.
///
/// Graph: two player "decks" -> bus mixer -> 10-band EQ -> time/pitch -> main mixer -> output.
/// Two decks let the next song start at an exact moment (gapless) or overlap (crossfade).
/// All methods must be called on the main thread.
final class PlaybackEngine: NSObject {
  enum RepeatMode: String {
    case off
    case all
    case one
  }

  static let eqFrequencies: [Float] = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]

  var emit: ((String, [String: Any?]) -> Void)?

  // MARK: Audio graph

  private let engine = AVAudioEngine()
  private let players = [AVAudioPlayerNode(), AVAudioPlayerNode()]
  private let busMixer = AVAudioMixerNode()
  private let eq = AVAudioUnitEQ(numberOfBands: PlaybackEngine.eqFrequencies.count)
  private let timePitch = AVAudioUnitTimePitch()
  private var deckBus: [AVAudioNodeBus] = [0, 1]
  private var deckFormat: [AVAudioFormat?] = [nil, nil]

  private struct Deck {
    var file: AVAudioFile?
    var entryKey: String?
    var startFrame: AVAudioFramePosition = 0
    var token: Int = 0
  }

  private var decks = [Deck(), Deck()]
  private var active = 0
  private var scheduleToken = 0

  // MARK: Queue state

  private var entries: [QueueEntry] = []
  private var unshuffledKeys: [String]?
  private var index = -1

  // MARK: Playback state

  private(set) var isPlaying = false
  private var pausedPosition: Double = 0
  private var shuffle = false
  private var repeatMode: RepeatMode = .off
  private var rate: Float = 1
  private var crossfade: Double = 0
  private var gapless = true
  private var wasPlayingBeforeInterruption = false
  private var consecutiveErrors = 0

  /// The next song is scheduled on the idle deck and will start at `startHostTime`.
  private struct PendingTransition {
    let deck: Int
    let index: Int
    let entryKey: String
    let startHostTime: UInt64
  }

  /// The previous deck is fading out after the next song has started.
  private struct Fade {
    let fromDeck: Int
    let toDeck: Int
    let startHostTime: UInt64
    let duration: Double
  }

  private var pending: PendingTransition?
  private var fade: Fade?
  private var timer: Timer?
  private var lastProgressEmit: CFTimeInterval = 0
  private var sessionConfigured = false

  // MARK: Init

  override init() {
    super.init()
    setUpGraph()
    setUpRemoteCommands()
    observeSession()
  }

  private func setUpGraph() {
    engine.attach(busMixer)
    engine.attach(eq)
    engine.attach(timePitch)
    for player in players {
      engine.attach(player)
    }

    let standard = AVAudioFormat(standardFormatWithSampleRate: 44_100, channels: 2)!
    for (deck, player) in players.enumerated() {
      let bus = busMixer.nextAvailableInputBus
      deckBus[deck] = bus
      engine.connect(player, to: busMixer, fromBus: 0, toBus: bus, format: standard)
      deckFormat[deck] = standard
    }
    engine.connect(busMixer, to: eq, format: standard)
    engine.connect(eq, to: timePitch, format: standard)
    engine.connect(timePitch, to: engine.mainMixerNode, format: standard)

    for (i, band) in eq.bands.enumerated() {
      band.frequency = PlaybackEngine.eqFrequencies[i]
      band.gain = 0
      band.bypass = false
      if i == 0 {
        band.filterType = .lowShelf
      } else if i == eq.bands.count - 1 {
        band.filterType = .highShelf
      } else {
        band.filterType = .parametric
        band.bandwidth = 1.0
      }
    }
    eq.bypass = true
    timePitch.rate = 1
    timePitch.bypass = true
    engine.prepare()
  }

  private func configureSessionIfNeeded() {
    guard !sessionConfigured else { return }
    let session = AVAudioSession.sharedInstance()
    do {
      try session.setCategory(.playback, mode: .default, policy: .longFormAudio, options: [])
      try session.setActive(true)
      sessionConfigured = true
    } catch {
      emitError(trackId: nil, message: "Audio session error: \(error.localizedDescription)")
    }
  }

  private func startEngineIfNeeded() -> Bool {
    configureSessionIfNeeded()
    if engine.isRunning { return true }
    do {
      try engine.start()
      return true
    } catch {
      emitError(trackId: nil, message: "Could not start audio: \(error.localizedDescription)")
      return false
    }
  }

  // MARK: Queue API

  func setQueue(_ tracks: [QueueTrack], startIndex: Int, startPosition: Double, autoplay: Bool) {
    entries = tracks.map(QueueEntry.init)
    unshuffledKeys = nil
    if shuffle {
      applyShuffle(keepingIndex: max(0, min(startIndex, entries.count - 1)), shuffleAll: true)
    } else {
      index = entries.isEmpty ? -1 : max(0, min(startIndex, entries.count - 1))
    }
    emitQueue()
    if index >= 0 {
      load(index: index, at: startPosition, autoplay: autoplay)
    } else {
      stopAll()
      updateNowPlayingInfo()
      emitState()
    }
  }

  func insertNext(_ tracks: [QueueTrack]) {
    guard !tracks.isEmpty else { return }
    let newEntries = tracks.map(QueueEntry.init)
    let insertAt = index >= 0 ? index + 1 : 0
    entries.insert(contentsOf: newEntries, at: insertAt)
    if var keys = unshuffledKeys, index >= 0, let currentKey = currentEntry?.key,
       let pos = keys.firstIndex(of: currentKey) {
      keys.insert(contentsOf: newEntries.map(\.key), at: pos + 1)
      unshuffledKeys = keys
    } else {
      unshuffledKeys?.append(contentsOf: newEntries.map(\.key))
    }
    if index < 0 {
      index = 0
      emitQueue()
      load(index: 0, at: 0, autoplay: false)
      return
    }
    cancelPendingTransition()
    emitQueue()
  }

  func append(_ tracks: [QueueTrack]) {
    guard !tracks.isEmpty else { return }
    let newEntries = tracks.map(QueueEntry.init)
    entries.append(contentsOf: newEntries)
    unshuffledKeys?.append(contentsOf: newEntries.map(\.key))
    if index < 0 {
      index = 0
      emitQueue()
      load(index: 0, at: 0, autoplay: false)
      return
    }
    cancelPendingTransition()
    emitQueue()
  }

  func move(from: Int, to: Int) {
    guard entries.indices.contains(from), to >= 0, to < entries.count, from != to else { return }
    let currentKey = currentEntry?.key
    let entry = entries.remove(at: from)
    entries.insert(entry, at: to)
    if let key = currentKey, let newIndex = entries.firstIndex(where: { $0.key == key }) {
      index = newIndex
    }
    cancelPendingTransition()
    emitQueue()
    emitState()
  }

  func remove(at position: Int) {
    guard entries.indices.contains(position) else { return }
    let removed = entries.remove(at: position)
    unshuffledKeys?.removeAll { $0 == removed.key }

    if position < index {
      index -= 1
      cancelPendingTransition()
      emitQueue()
      emitState()
    } else if position == index {
      let wasPlaying = isPlaying
      if entries.isEmpty {
        index = -1
        stopAll()
        emitQueue()
        updateNowPlayingInfo()
        emitState()
      } else {
        index = min(position, entries.count - 1)
        emitQueue()
        load(index: index, at: 0, autoplay: wasPlaying)
      }
    } else {
      cancelPendingTransition()
      emitQueue()
    }
  }

  func clearUpNext() {
    guard index >= 0, index + 1 < entries.count else { return }
    let removedKeys = Set(entries[(index + 1)...].map(\.key))
    entries.removeSubrange((index + 1)...)
    unshuffledKeys?.removeAll { removedKeys.contains($0) }
    cancelPendingTransition()
    emitQueue()
  }

  func skipTo(_ position: Int) {
    guard entries.indices.contains(position) else { return }
    index = position
    emitQueue()
    load(index: position, at: 0, autoplay: true)
  }

  /// Refreshes title/artwork for every queue entry of a track (e.g. after the user edits artwork).
  func updateTrackInfo(_ track: QueueTrack) {
    var changed = false
    for i in entries.indices where entries[i].track.id == track.id {
      entries[i].track.title = track.title
      entries[i].track.artist = track.artist
      entries[i].track.album = track.album
      entries[i].track.artworkUri = track.artworkUri
      changed = true
    }
    if changed, currentEntry?.track.id == track.id {
      updateNowPlayingInfo(reloadArtwork: true)
    }
  }

  // MARK: Transport

  func play() {
    guard index >= 0 else { return }
    if decks[active].file == nil || decks[active].entryKey != currentEntry?.key {
      load(index: index, at: pausedPosition, autoplay: true)
      return
    }
    guard startEngineIfNeeded() else { return }
    let player = players[active]
    if !player.isPlaying {
      player.play()
    }
    isPlaying = true
    consecutiveErrors = 0
    startTimer()
    updateNowPlayingInfo()
    emitState()
  }

  func pause() {
    guard isPlaying else { return }
    finishTransitionImmediately()
    pausedPosition = position(of: active)
    players[active].pause()
    isPlaying = false
    stopTimer()
    updateNowPlayingInfo()
    emitState()
  }

  func togglePlayPause() {
    isPlaying ? pause() : play()
  }

  func next() {
    guard !entries.isEmpty else { return }
    if index + 1 < entries.count {
      index += 1
      emitQueue()
      load(index: index, at: 0, autoplay: isPlaying)
    } else if repeatMode != .off {
      index = 0
      emitQueue()
      load(index: 0, at: 0, autoplay: isPlaying)
    } else {
      // End of the queue: start again from the first song and keep the play state,
      // so pressing skip never silently pauses the music.
      index = 0
      emitQueue()
      load(index: 0, at: 0, autoplay: isPlaying)
    }
  }

  func previous() {
    guard index >= 0 else { return }
    if currentPosition() > 3 || (index == 0 && repeatMode == .off) {
      seek(to: 0)
      return
    }
    index = index > 0 ? index - 1 : entries.count - 1
    emitQueue()
    load(index: index, at: 0, autoplay: isPlaying)
  }

  func seek(to seconds: Double) {
    guard index >= 0 else { return }
    load(index: index, at: max(0, seconds), autoplay: isPlaying)
  }

  // MARK: Modes

  func setShuffle(_ enabled: Bool) {
    guard enabled != shuffle else { return }
    shuffle = enabled
    if enabled {
      applyShuffle(keepingIndex: index, shuffleAll: false)
    } else if let keys = unshuffledKeys {
      let byKey = Dictionary(uniqueKeysWithValues: entries.map { ($0.key, $0) })
      var restored = keys.compactMap { byKey[$0] }
      let restoredKeys = Set(restored.map(\.key))
      restored.append(contentsOf: entries.filter { !restoredKeys.contains($0.key) })
      let currentKey = currentEntry?.key
      entries = restored
      if let key = currentKey, let i = entries.firstIndex(where: { $0.key == key }) {
        index = i
      }
      unshuffledKeys = nil
    }
    cancelPendingTransition()
    emitQueue()
    emitState()
  }

  /// Shuffles the songs after the current one (or everything, when starting a new queue).
  private func applyShuffle(keepingIndex keep: Int, shuffleAll: Bool) {
    unshuffledKeys = entries.map(\.key)
    guard !entries.isEmpty else {
      index = -1
      return
    }
    if shuffleAll {
      let first = entries[keep]
      var rest = entries
      rest.remove(at: keep)
      rest.shuffle()
      entries = [first] + rest
      index = 0
    } else if keep >= 0, keep + 1 < entries.count {
      var upcoming = Array(entries[(keep + 1)...])
      upcoming.shuffle()
      entries.replaceSubrange((keep + 1)..., with: upcoming)
    }
  }

  func setRepeatMode(_ mode: RepeatMode) {
    repeatMode = mode
    cancelPendingTransition()
    emitState()
  }

  func setRate(_ newRate: Float) {
    rate = max(0.5, min(2.0, newRate))
    timePitch.rate = rate
    timePitch.bypass = abs(rate - 1) < 0.001
    cancelPendingTransition()
    updateNowPlayingInfo()
    emitState()
  }

  func setCrossfade(_ seconds: Double) {
    crossfade = max(0, min(12, seconds))
    cancelPendingTransition()
  }

  func setGapless(_ enabled: Bool) {
    gapless = enabled
    cancelPendingTransition()
  }

  func setEqualizer(enabled: Bool, gains: [Float]) {
    for (i, band) in eq.bands.enumerated() where i < gains.count {
      band.gain = max(-12, min(12, gains[i]))
    }
    // Leave headroom for boosts so the EQ cannot clip.
    let maxBoost = gains.max() ?? 0
    eq.globalGain = enabled ? -max(0, maxBoost) * 0.6 : 0
    eq.bypass = !enabled
  }

  // MARK: Loading

  private var currentEntry: QueueEntry? {
    entries.indices.contains(index) ? entries[index] : nil
  }

  private func openFile(for entry: QueueEntry) -> AVAudioFile? {
    guard let url = MetadataReader.fileURL(from: entry.track.uri) else { return nil }
    return try? AVAudioFile(forReading: url)
  }

  /// Makes sure the deck's connection matches the file's format (sample rate / channels).
  private func connect(deck: Int, for file: AVAudioFile) {
    let format = file.processingFormat
    if let current = deckFormat[deck],
       current.sampleRate == format.sampleRate,
       current.channelCount == format.channelCount {
      return
    }
    engine.disconnectNodeOutput(players[deck])
    engine.connect(players[deck], to: busMixer, fromBus: 0, toBus: deckBus[deck], format: format)
    deckFormat[deck] = format
  }

  /// Schedules `file` on `deck` from `startFrame` to the end of the file.
  @discardableResult
  private func schedule(deck: Int, file: AVAudioFile, entryKey: String, startFrame: AVAudioFramePosition) -> Bool {
    let player = players[deck]
    player.stop()
    connect(deck: deck, for: file)
    let frames = file.length - startFrame
    guard frames > 0 else { return false }
    scheduleToken += 1
    let token = scheduleToken
    decks[deck] = Deck(file: file, entryKey: entryKey, startFrame: startFrame, token: token)
    player.scheduleSegment(
      file,
      startingFrame: startFrame,
      frameCount: AVAudioFrameCount(frames),
      at: nil,
      completionCallbackType: .dataPlayedBack
    ) { [weak self] _ in
      DispatchQueue.main.async {
        self?.deckFinished(deck: deck, token: token)
      }
    }
    return true
  }

  /// Loads the queue entry at `index` into the active deck, optionally starting playback.
  private func load(index newIndex: Int, at seconds: Double, autoplay: Bool) {
    guard entries.indices.contains(newIndex) else { return }
    resetTransitions()
    let entry = entries[newIndex]
    index = newIndex

    guard let file = openFile(for: entry) else {
      handleLoadFailure(entry: entry, autoplay: autoplay)
      return
    }

    let sampleRate = file.processingFormat.sampleRate
    let duration = Double(file.length) / sampleRate
    let clamped = max(0, min(seconds, max(0, duration - 0.05)))
    let startFrame = AVAudioFramePosition(clamped * sampleRate)

    guard startEngineIfNeeded() else { return }
    players[1 - active].stop()
    players[1 - active].volume = 1
    players[active].volume = 1
    schedule(deck: active, file: file, entryKey: entry.key, startFrame: startFrame)
    pausedPosition = clamped

    if autoplay {
      players[active].play()
      isPlaying = true
      consecutiveErrors = 0
      startTimer()
    } else {
      isPlaying = false
      stopTimer()
    }
    updateNowPlayingInfo(reloadArtwork: true)
    emitState()
  }

  private func handleLoadFailure(entry: QueueEntry, autoplay: Bool) {
    emitError(trackId: entry.track.id, message: "This file can't be played. It may have been moved or deleted.")
    consecutiveErrors += 1
    stopAll()
    if consecutiveErrors < min(entries.count, 25), index + 1 < entries.count {
      index += 1
      emitQueue()
      load(index: index, at: 0, autoplay: autoplay)
    } else {
      consecutiveErrors = 0
      isPlaying = false
      updateNowPlayingInfo()
      emitState()
    }
  }

  private func stopAll() {
    resetTransitions()
    players[0].stop()
    players[1].stop()
    decks = [Deck(), Deck()]
    isPlaying = false
    pausedPosition = 0
    stopTimer()
  }

  // MARK: Position

  private func duration(of deck: Int) -> Double {
    guard let file = decks[deck].file else { return 0 }
    return Double(file.length) / file.processingFormat.sampleRate
  }

  private func position(of deck: Int) -> Double {
    guard let file = decks[deck].file else { return 0 }
    let sampleRate = file.processingFormat.sampleRate
    let player = players[deck]
    if player.isPlaying,
       let nodeTime = player.lastRenderTime,
       nodeTime.isSampleTimeValid,
       let playerTime = player.playerTime(forNodeTime: nodeTime) {
      let frame = decks[deck].startFrame + max(0, playerTime.sampleTime)
      return min(Double(frame) / sampleRate, Double(file.length) / sampleRate)
    }
    if deck == active { return pausedPosition }
    return Double(decks[deck].startFrame) / sampleRate
  }

  func currentPosition() -> Double {
    isPlaying ? position(of: active) : pausedPosition
  }

  // MARK: Transitions (gapless + crossfade)

  private func nextIndexForAutoAdvance() -> Int? {
    guard !entries.isEmpty, index >= 0 else { return nil }
    if repeatMode == .one { return index }
    if index + 1 < entries.count { return index + 1 }
    if repeatMode == .all { return 0 }
    return nil
  }

  private func startTimer() {
    guard timer == nil else { return }
    let t = Timer(timeInterval: 1.0 / 30.0, repeats: true) { [weak self] _ in
      self?.tick()
    }
    RunLoop.main.add(t, forMode: .common)
    timer = t
  }

  private func stopTimer() {
    timer?.invalidate()
    timer = nil
  }

  private func tick() {
    guard isPlaying, decks[active].file != nil else { return }
    let now = CACurrentMediaTime()

    if let p = pending {
      // Has the scheduled deck actually started rendering yet?
      if mach_absolute_time() >= p.startHostTime {
        commitPending(p)
      }
    } else if fade == nil, crossfade > 0 || gapless {
      armNextIfNeeded()
    }

    if let f = fade {
      updateFade(f)
    }

    if now - lastProgressEmit >= 0.5 {
      lastProgressEmit = now
      emit?("onProgress", [
        "position": position(of: active),
        "duration": duration(of: active),
      ])
    }
  }

  private func armNextIfNeeded() {
    guard let nextIndex = nextIndexForAutoAdvance() else { return }
    let current = active
    let remainingTrack = duration(of: current) - position(of: current)
    let remainingReal = remainingTrack / Double(rate)
    let overlap = min(crossfade, max(0, duration(of: current) / 2))
    // Arm about 1.5 s ahead so the next file is opened and ready.
    guard remainingReal <= overlap + 1.5 else { return }

    let player = players[current]
    guard player.isPlaying,
          let nodeTime = player.lastRenderTime,
          nodeTime.isHostTimeValid else { return }

    let entry = entries[nextIndex]
    guard let file = openFile(for: entry) else { return }
    let deck = 1 - current
    guard schedule(deck: deck, file: file, entryKey: entry.key, startFrame: 0) else { return }

    let startIn = max(0, remainingReal - overlap)
    let startHost = nodeTime.hostTime + AVAudioTime.hostTime(forSeconds: startIn)
    players[deck].volume = overlap > 0 ? 0 : 1
    players[deck].play(at: AVAudioTime(hostTime: startHost))
    pending = PendingTransition(deck: deck, index: nextIndex, entryKey: entry.key, startHostTime: startHost)
  }

  /// The next song has started: it becomes the current song.
  private func commitPending(_ p: PendingTransition) {
    pending = nil
    let from = active
    guard entries.indices.contains(p.index), entries[p.index].key == p.entryKey else {
      players[p.deck].stop()
      return
    }
    active = p.deck
    index = p.index
    pausedPosition = 0
    fade = Fade(fromDeck: from, toDeck: p.deck, startHostTime: p.startHostTime, duration: min(crossfade, 12))
    updateNowPlayingInfo(reloadArtwork: true)
    emitQueue()
    emitState()
  }

  private func updateFade(_ f: Fade) {
    let elapsed = AVAudioTime.seconds(forHostTime: mach_absolute_time() - min(mach_absolute_time(), f.startHostTime))
    if f.duration > 0 {
      let t = Float(min(1, elapsed / f.duration))
      // Equal-power curve keeps the loudness steady through the overlap.
      players[f.toDeck].volume = sin(t * .pi / 2)
      players[f.fromDeck].volume = cos(t * .pi / 2)
    }
    if elapsed >= f.duration + 0.3 {
      players[f.fromDeck].stop()
      players[f.fromDeck].volume = 1
      players[f.toDeck].volume = 1
      decks[f.fromDeck] = Deck()
      fade = nil
    }
  }

  private func cancelPendingTransition() {
    guard let p = pending else { return }
    players[p.deck].stop()
    players[p.deck].volume = 1
    decks[p.deck] = Deck()
    pending = nil
  }

  private func finishTransitionImmediately() {
    cancelPendingTransition()
    if let f = fade {
      players[f.fromDeck].stop()
      players[f.fromDeck].volume = 1
      players[f.toDeck].volume = 1
      decks[f.fromDeck] = Deck()
      fade = nil
    }
  }

  private func resetTransitions() {
    finishTransitionImmediately()
  }

  /// Called when a deck has played all of its scheduled audio.
  private func deckFinished(deck: Int, token: Int) {
    guard decks[deck].token == token, decks[deck].file != nil else { return }
    // A deck that finished after handing over (gapless/crossfade) needs nothing more.
    guard deck == active, pending == nil, fade == nil, isPlaying else { return }

    if let nextIndex = nextIndexForAutoAdvance() {
      index = nextIndex
      emitQueue()
      load(index: nextIndex, at: 0, autoplay: true)
    } else {
      // End of the queue.
      players[active].stop()
      decks[active] = Deck()
      isPlaying = false
      pausedPosition = 0
      stopTimer()
      updateNowPlayingInfo()
      emitState()
    }
  }

  // MARK: Events

  func snapshot() -> [String: Any] {
    var state = stateBody()
    state["entries"] = entries.map { ["key": $0.key, "id": $0.track.id] }
    return state.compactMapValues { $0 }
  }

  private func stateBody() -> [String: Any?] {
    let entry = currentEntry
    return [
      "isPlaying": isPlaying,
      "index": index,
      "entryKey": entry?.key,
      "trackId": entry?.track.id,
      "position": currentPosition(),
      "duration": decks[active].file != nil ? duration(of: active) : (entry?.track.duration ?? 0),
      "shuffle": shuffle,
      "repeatMode": repeatMode.rawValue,
      "rate": Double(rate),
    ]
  }

  private func emitState() {
    emit?("onStateChange", stateBody())
  }

  private func emitQueue() {
    emit?("onQueueChange", [
      "entries": entries.map { ["key": $0.key, "id": $0.track.id] },
      "index": index,
    ])
  }

  private func emitError(trackId: String?, message: String) {
    emit?("onError", ["trackId": trackId, "message": message])
  }

  // MARK: Lock Screen / Control Center

  private var artworkCacheKey: String?
  private var artworkCache: MPMediaItemArtwork?

  private func updateNowPlayingInfo(reloadArtwork: Bool = false) {
    let center = MPNowPlayingInfoCenter.default()
    guard let entry = currentEntry else {
      center.nowPlayingInfo = nil
      return
    }
    var info: [String: Any] = [
      MPMediaItemPropertyTitle: entry.track.title,
      MPMediaItemPropertyArtist: entry.track.artist,
      MPMediaItemPropertyAlbumTitle: entry.track.album,
      MPMediaItemPropertyPlaybackDuration: decks[active].file != nil ? duration(of: active) : entry.track.duration,
      MPNowPlayingInfoPropertyElapsedPlaybackTime: currentPosition(),
      MPNowPlayingInfoPropertyPlaybackRate: isPlaying ? Double(rate) : 0.0,
      MPNowPlayingInfoPropertyDefaultPlaybackRate: Double(rate),
      MPNowPlayingInfoPropertyMediaType: MPNowPlayingInfoMediaType.audio.rawValue,
      MPNowPlayingInfoPropertyPlaybackQueueIndex: index,
      MPNowPlayingInfoPropertyPlaybackQueueCount: entries.count,
    ]

    let artKey = entry.track.artworkUri
    if !reloadArtwork, artKey == artworkCacheKey, let art = artworkCache {
      info[MPMediaItemPropertyArtwork] = art
      center.nowPlayingInfo = info
      return
    }

    center.nowPlayingInfo = info
    artworkCacheKey = artKey
    artworkCache = nil
    guard let path = artKey, let url = MetadataReader.fileURL(from: path) else { return }
    let entryKey = entry.key
    DispatchQueue.global(qos: .userInitiated).async { [weak self] in
      guard let image = UIImage(contentsOfFile: url.path) else { return }
      // The system calls this handler on a background queue, so it must not be tied to the main thread.
      let artwork = MPMediaItemArtwork(boundsSize: image.size) { @Sendable _ in image }
      DispatchQueue.main.async {
        guard let self, self.currentEntry?.key == entryKey else { return }
        self.artworkCache = artwork
        var current = center.nowPlayingInfo ?? info
        current[MPMediaItemPropertyArtwork] = artwork
        center.nowPlayingInfo = current
      }
    }
  }

  private func setUpRemoteCommands() {
    let center = MPRemoteCommandCenter.shared()
    center.playCommand.addTarget { [weak self] _ in
      self?.play()
      return .success
    }
    center.pauseCommand.addTarget { [weak self] _ in
      self?.pause()
      return .success
    }
    center.togglePlayPauseCommand.addTarget { [weak self] _ in
      self?.togglePlayPause()
      return .success
    }
    center.nextTrackCommand.addTarget { [weak self] _ in
      self?.next()
      return .success
    }
    center.previousTrackCommand.addTarget { [weak self] _ in
      self?.previous()
      return .success
    }
    center.changePlaybackPositionCommand.addTarget { [weak self] event in
      guard let event = event as? MPChangePlaybackPositionCommandEvent else { return .commandFailed }
      self?.seek(to: event.positionTime)
      return .success
    }
    center.skipForwardCommand.isEnabled = false
    center.skipBackwardCommand.isEnabled = false
    center.seekForwardCommand.isEnabled = false
    center.seekBackwardCommand.isEnabled = false
  }

  // MARK: Interruptions, route changes, engine resets

  private func observeSession() {
    let nc = NotificationCenter.default
    nc.addObserver(
      self, selector: #selector(handleInterruption(_:)),
      name: AVAudioSession.interruptionNotification, object: AVAudioSession.sharedInstance()
    )
    nc.addObserver(
      self, selector: #selector(handleRouteChange(_:)),
      name: AVAudioSession.routeChangeNotification, object: AVAudioSession.sharedInstance()
    )
    nc.addObserver(
      self, selector: #selector(handleEngineConfigurationChange(_:)),
      name: .AVAudioEngineConfigurationChange, object: engine
    )
    nc.addObserver(
      self, selector: #selector(handleMediaServicesReset(_:)),
      name: AVAudioSession.mediaServicesWereResetNotification, object: AVAudioSession.sharedInstance()
    )
  }

  @objc private func handleInterruption(_ note: Notification) {
    DispatchQueue.main.async { [self] in
      guard let info = note.userInfo,
            let typeValue = info[AVAudioSessionInterruptionTypeKey] as? UInt,
            let type = AVAudioSession.InterruptionType(rawValue: typeValue) else { return }
      switch type {
      case .began:
        wasPlayingBeforeInterruption = isPlaying
        if isPlaying { pause() }
      case .ended:
        let optionsValue = info[AVAudioSessionInterruptionOptionKey] as? UInt ?? 0
        let options = AVAudioSession.InterruptionOptions(rawValue: optionsValue)
        if wasPlayingBeforeInterruption && options.contains(.shouldResume) {
          sessionConfigured = false
          play()
        }
        wasPlayingBeforeInterruption = false
      @unknown default:
        break
      }
    }
  }

  @objc private func handleRouteChange(_ note: Notification) {
    DispatchQueue.main.async { [self] in
      guard let info = note.userInfo,
            let reasonValue = info[AVAudioSessionRouteChangeReasonKey] as? UInt,
            let reason = AVAudioSession.RouteChangeReason(rawValue: reasonValue) else { return }
      // Headphones unplugged / Bluetooth disconnected: pause, as iOS users expect.
      if reason == .oldDeviceUnavailable, isPlaying {
        pause()
      }
    }
  }

  @objc private func handleEngineConfigurationChange(_ note: Notification) {
    DispatchQueue.main.async { [self] in
      rebuildAfterReset()
    }
  }

  @objc private func handleMediaServicesReset(_ note: Notification) {
    DispatchQueue.main.async { [self] in
      sessionConfigured = false
      rebuildAfterReset()
    }
  }

  private func rebuildAfterReset() {
    let resumeAt = currentPosition()
    let wasPlaying = isPlaying
    resetTransitions()
    players[0].stop()
    players[1].stop()
    // Force reconnection with the file's format on the next load.
    deckFormat = [nil, nil]
    isPlaying = false
    guard index >= 0 else { return }
    load(index: index, at: resumeAt, autoplay: wasPlaying)
  }
}
