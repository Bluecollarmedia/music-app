import AVFoundation
import UIKit

/// Song details written into a shared copy of a song file.
struct ShareTags {
  var title: String
  var artist: String
  var album: String
  var albumArtist: String?
  var genre: String?
  var year: Int?
  var trackNumber: Int?
  var discNumber: Int?
  var artworkURL: URL?
}

enum SongExportError: LocalizedError {
  case unreadable
  case exportFailed(String)

  var errorDescription: String? {
    switch self {
    case .unreadable: return "This song's file couldn't be read."
    case .exportFailed(let reason): return "Couldn't prepare the song for sharing. \(reason)"
    }
  }
}

/// Makes a copy of a song for sharing, with the library's current title, artist, album and
/// artwork written into the file. The original file in the library is never changed.
///
/// - MP3: the audio is copied byte for byte and given a fresh ID3v2.3 tag.
/// - M4A / AAC / ALAC: the audio is copied as is into a new .m4a with new tags.
/// - WAV, AIFF, FLAC and others: converted to high-quality AAC (.m4a), since those formats
///   have no tags (or none that iPhone can write).
enum SongExporter {
  static func export(source: URL, tags: ShareTags) async throws -> URL {
    let dir = FileManager.default.temporaryDirectory.appendingPathComponent("share", isDirectory: true)
    try? FileManager.default.removeItem(at: dir)
    try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)

    let ext = source.pathExtension.lowercased()
    let base = fileName(tags)
    let artwork = loadArtworkJPEG(tags.artworkURL)

    if ext == "mp3" {
      let out = dir.appendingPathComponent("\(base).mp3")
      try writeMP3(source: source, to: out, tags: tags, artwork: artwork)
      return out
    }

    let out = dir.appendingPathComponent("\(base).m4a")
    let passthrough = ["m4a", "mp4", "aac", "alac", "m4b"].contains(ext)
    try await exportM4A(
      source: source,
      to: out,
      preset: passthrough ? AVAssetExportPresetPassthrough : AVAssetExportPresetAppleM4A,
      tags: tags,
      artwork: artwork
    )
    return out
  }

  // MARK: Names and artwork

  private static func fileName(_ tags: ShareTags) -> String {
    let raw = tags.artist.isEmpty ? tags.title : "\(tags.artist) - \(tags.title)"
    let banned = CharacterSet(charactersIn: "/\\:?%*|\"<>")
    let cleaned = raw.components(separatedBy: banned).joined(separator: " ").trimmingCharacters(in: .whitespaces)
    return cleaned.isEmpty ? "Song" : String(cleaned.prefix(120))
  }

  private static func loadArtworkJPEG(_ url: URL?) -> Data? {
    guard let url, let data = try? Data(contentsOf: url) else { return nil }
    if data.starts(with: [0xFF, 0xD8]) { return data }
    return UIImage(data: data)?.jpegData(compressionQuality: 0.9)
  }

  // MARK: MP3 (ID3v2.3)

  private static func writeMP3(source: URL, to out: URL, tags: ShareTags, artwork: Data?) throws {
    guard var audio = try? Data(contentsOf: source) else { throw SongExportError.unreadable }

    // Drop the old ID3v2 tag at the start...
    if audio.count > 10, audio.starts(with: Array("ID3".utf8)) {
      let b = [UInt8](audio[6..<10])
      let size = Int(b[0]) << 21 | Int(b[1]) << 14 | Int(b[2]) << 7 | Int(b[3])
      let hasFooter = audio[5] & 0x10 != 0
      let end = min(audio.count, 10 + size + (hasFooter ? 10 : 0))
      audio = audio.subdata(in: end..<audio.count)
    }
    // ...and the old ID3v1 tag at the end, so players can't show stale details.
    if audio.count > 128, audio.subdata(in: (audio.count - 128)..<(audio.count - 125)) == Data("TAG".utf8) {
      audio = audio.subdata(in: 0..<(audio.count - 128))
    }

    var frames = Data()
    frames.append(textFrame("TIT2", tags.title))
    frames.append(textFrame("TPE1", tags.artist))
    frames.append(textFrame("TALB", tags.album))
    if let v = tags.albumArtist, !v.isEmpty { frames.append(textFrame("TPE2", v)) }
    if let v = tags.genre, !v.isEmpty { frames.append(textFrame("TCON", v)) }
    if let v = tags.year { frames.append(textFrame("TYER", String(v))) }
    if let v = tags.trackNumber { frames.append(textFrame("TRCK", String(v))) }
    if let v = tags.discNumber { frames.append(textFrame("TPOS", String(v))) }
    if let artwork {
      var body = Data([0x00])                 // ISO-8859-1 for the fields below
      body.append(Data("image/jpeg".utf8))
      body.append(0x00)
      body.append(0x03)                       // picture type: front cover
      body.append(0x00)                       // empty description
      body.append(artwork)
      frames.append(frame("APIC", body))
    }

    var tag = Data("ID3".utf8)
    tag.append(contentsOf: [0x03, 0x00, 0x00])
    tag.append(syncsafe(frames.count))
    tag.append(frames)
    tag.append(audio)
    try tag.write(to: out, options: .atomic)
  }

  private static func textFrame(_ id: String, _ text: String) -> Data {
    var body = Data([0x01, 0xFF, 0xFE])        // UTF-16 with a little-endian BOM
    for unit in text.utf16 {
      body.append(UInt8(unit & 0xFF))
      body.append(UInt8(unit >> 8))
    }
    return frame(id, body)
  }

  private static func frame(_ id: String, _ body: Data) -> Data {
    var f = Data(id.utf8)
    let n = body.count
    f.append(contentsOf: [UInt8(n >> 24 & 0xFF), UInt8(n >> 16 & 0xFF), UInt8(n >> 8 & 0xFF), UInt8(n & 0xFF)])
    f.append(contentsOf: [0x00, 0x00])
    f.append(body)
    return f
  }

  private static func syncsafe(_ n: Int) -> Data {
    Data([UInt8(n >> 21 & 0x7F), UInt8(n >> 14 & 0x7F), UInt8(n >> 7 & 0x7F), UInt8(n & 0x7F)])
  }

  // MARK: M4A

  private static func exportM4A(source: URL, to out: URL, preset: String, tags: ShareTags, artwork: Data?) async throws {
    let asset = AVURLAsset(url: source)
    guard let session = AVAssetExportSession(asset: asset, presetName: preset) else {
      throw SongExportError.exportFailed("This format can't be converted.")
    }

    var items: [AVMetadataItem] = []
    func add(_ identifier: AVMetadataIdentifier, _ value: (NSCopying & NSObjectProtocol)?, dataType: String? = nil) {
      guard let value else { return }
      let item = AVMutableMetadataItem()
      item.identifier = identifier
      item.value = value
      if let dataType { item.dataType = dataType }
      item.extendedLanguageTag = "und"
      items.append(item)
    }
    add(.iTunesMetadataSongName, tags.title as NSString)
    add(.iTunesMetadataArtist, tags.artist as NSString)
    add(.iTunesMetadataAlbum, tags.album as NSString)
    add(.iTunesMetadataAlbumArtist, tags.albumArtist.flatMap { $0.isEmpty ? nil : $0 as NSString })
    add(.iTunesMetadataUserGenre, tags.genre.flatMap { $0.isEmpty ? nil : $0 as NSString })
    add(.iTunesMetadataReleaseDate, tags.year.map { String($0) as NSString })
    if let n = tags.trackNumber, n > 0, n < 65_536 {
      let bytes: [UInt8] = [0, 0, UInt8(n >> 8), UInt8(n & 0xFF), 0, 0, 0, 0]
      add(.iTunesMetadataTrackNumber, Data(bytes) as NSData, dataType: kCMMetadataBaseDataType_RawData as String)
    }
    if let artwork {
      add(.iTunesMetadataCoverArt, artwork as NSData, dataType: kCMMetadataBaseDataType_JPEG as String)
    }
    session.metadata = items

    do {
      try await session.export(to: out, as: .m4a)
    } catch {
      throw SongExportError.exportFailed(error.localizedDescription)
    }
  }
}
