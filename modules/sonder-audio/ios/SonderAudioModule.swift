import AVFoundation
import AVKit
import ExpoModulesCore

/// A track handed to the native engine. The engine only needs what it plays and
/// what it shows on the Lock Screen; everything else stays in the JS library.
struct QueueTrackRecord: Record {
  @Field var id: String = ""
  @Field var uri: String = ""
  @Field var title: String = ""
  @Field var artist: String = ""
  @Field var album: String = ""
  @Field var artworkUri: String? = nil
  @Field var duration: Double = 0
}

public class SonderAudioModule: Module {
  private lazy var engine: PlaybackEngine = {
    let engine = PlaybackEngine()
    engine.emit = { [weak self] name, body in
      self?.sendEvent(name, body)
    }
    return engine
  }()

  public func definition() -> ModuleDefinition {
    Name("SonderAudio")

    Events("onStateChange", "onQueueChange", "onProgress", "onError")

    OnCreate {
      DispatchQueue.main.async {
        _ = self.engine
      }
    }

    // MARK: State

    AsyncFunction("getState") { () -> [String: Any] in
      return self.engine.snapshot()
    }.runOnQueue(.main)

    // MARK: Queue

    AsyncFunction("setQueue") { (tracks: [QueueTrackRecord], startIndex: Int, startPosition: Double, autoplay: Bool) in
      self.engine.setQueue(tracks.map(QueueTrack.init), startIndex: startIndex, startPosition: startPosition, autoplay: autoplay)
    }.runOnQueue(.main)

    AsyncFunction("insertNext") { (tracks: [QueueTrackRecord]) in
      self.engine.insertNext(tracks.map(QueueTrack.init))
    }.runOnQueue(.main)

    AsyncFunction("append") { (tracks: [QueueTrackRecord]) in
      self.engine.append(tracks.map(QueueTrack.init))
    }.runOnQueue(.main)

    AsyncFunction("move") { (from: Int, to: Int) in
      self.engine.move(from: from, to: to)
    }.runOnQueue(.main)

    AsyncFunction("remove") { (position: Int) in
      self.engine.remove(at: position)
    }.runOnQueue(.main)

    AsyncFunction("clearUpNext") {
      self.engine.clearUpNext()
    }.runOnQueue(.main)

    AsyncFunction("skipTo") { (position: Int) in
      self.engine.skipTo(position)
    }.runOnQueue(.main)

    AsyncFunction("updateTrackInfo") { (track: QueueTrackRecord) in
      self.engine.updateTrackInfo(QueueTrack(track))
    }.runOnQueue(.main)

    // MARK: Transport

    AsyncFunction("play") {
      self.engine.play()
    }.runOnQueue(.main)

    AsyncFunction("pause") {
      self.engine.pause()
    }.runOnQueue(.main)

    AsyncFunction("togglePlayPause") {
      self.engine.togglePlayPause()
    }.runOnQueue(.main)

    AsyncFunction("next") {
      self.engine.next()
    }.runOnQueue(.main)

    AsyncFunction("previous") {
      self.engine.previous()
    }.runOnQueue(.main)

    AsyncFunction("seek") { (seconds: Double) in
      self.engine.seek(to: seconds)
    }.runOnQueue(.main)

    // MARK: Modes and audio settings

    AsyncFunction("setShuffle") { (enabled: Bool) in
      self.engine.setShuffle(enabled)
    }.runOnQueue(.main)

    AsyncFunction("setRepeatMode") { (mode: String) in
      self.engine.setRepeatMode(PlaybackEngine.RepeatMode(rawValue: mode) ?? .off)
    }.runOnQueue(.main)

    AsyncFunction("setRate") { (rate: Double) in
      self.engine.setRate(Float(rate))
    }.runOnQueue(.main)

    AsyncFunction("setCrossfade") { (seconds: Double) in
      self.engine.setCrossfade(seconds)
    }.runOnQueue(.main)

    AsyncFunction("setGapless") { (enabled: Bool) in
      self.engine.setGapless(enabled)
    }.runOnQueue(.main)

    AsyncFunction("setEqualizer") { (enabled: Bool, gains: [Double]) in
      self.engine.setEqualizer(enabled: enabled, gains: gains.map { Float($0) })
    }.runOnQueue(.main)

    Constant("equalizerFrequencies") { () -> [Double] in
      return PlaybackEngine.eqFrequencies.map { Double($0) }
    }

    // MARK: Metadata

    AsyncFunction("readMetadata") { (uri: String, artworkPath: String) async -> [String: Any] in
      guard let url = MetadataReader.fileURL(from: uri) else { return [:] }
      let artworkURL = MetadataReader.fileURL(from: artworkPath)
      return await MetadataReader.read(url: url, artworkURL: artworkURL)
    }

    // MARK: AirPlay / output picker

    View(RoutePickerView.self) {
      Prop("tintColor") { (view: RoutePickerView, color: UIColor?) in
        view.picker.tintColor = color ?? .white
      }
      Prop("activeTintColor") { (view: RoutePickerView, color: UIColor?) in
        view.picker.activeTintColor = color ?? .systemBlue
      }
    }
  }
}

/// Native AVRoutePickerView: the system AirPlay / Bluetooth output picker.
public final class RoutePickerView: ExpoView {
  let picker = AVRoutePickerView()

  public required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    picker.prioritizesVideoDevices = false
    picker.tintColor = .white
    picker.backgroundColor = .clear
    addSubview(picker)
  }

  public required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  public override func layoutSubviews() {
    super.layoutSubviews()
    picker.frame = bounds
  }
}
