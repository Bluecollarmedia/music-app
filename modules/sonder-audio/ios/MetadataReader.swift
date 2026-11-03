import AVFoundation
import ImageIO
import UIKit
import UniformTypeIdentifiers

/// Reads tags, duration and embedded artwork from an audio file using AVFoundation.
/// Never modifies the audio file.
enum MetadataReader {
  static func fileURL(from string: String) -> URL? {
    if string.hasPrefix("file://") {
      return URL(string: string)
    }
    if string.hasPrefix("/") {
      return URL(fileURLWithPath: string)
    }
    return URL(string: string)
  }

  static func read(url: URL, artworkURL: URL?) async -> [String: Any] {
    var result: [String: Any] = [:]

    // Duration and format from the decoder itself (more reliable than tags).
    if let file = try? AVAudioFile(forReading: url) {
      let format = file.fileFormat
      result["duration"] = Double(file.length) / file.processingFormat.sampleRate
      result["sampleRate"] = format.sampleRate
      result["channels"] = Int(format.channelCount)
      result["playable"] = true
    } else {
      result["playable"] = false
    }

    let asset = AVURLAsset(url: url)
    var items: [AVMetadataItem] = []
    if let common = try? await asset.load(.commonMetadata) {
      items.append(contentsOf: common)
    }
    if let formats = try? await asset.load(.availableMetadataFormats) {
      for format in formats {
        if let more = try? await asset.loadMetadata(for: format) {
          items.append(contentsOf: more)
        }
      }
    }

    func first(_ identifiers: [AVMetadataIdentifier]) -> AVMetadataItem? {
      for identifier in identifiers {
        if let item = AVMetadataItem.metadataItems(from: items, filteredByIdentifier: identifier).first {
          return item
        }
      }
      return nil
    }

    func string(_ identifiers: [AVMetadataIdentifier]) async -> String? {
      guard let item = first(identifiers) else { return nil }
      if let value = try? await item.load(.stringValue) {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
      }
      if let number = try? await item.load(.numberValue) {
        return number.stringValue
      }
      return nil
    }

    result["title"] = await string([.commonIdentifierTitle, .id3MetadataTitleDescription, .iTunesMetadataSongName])
    result["artist"] = await string([.commonIdentifierArtist, .id3MetadataLeadPerformer, .iTunesMetadataArtist])
    result["album"] = await string([.commonIdentifierAlbumName, .id3MetadataAlbumTitle, .iTunesMetadataAlbum])
    result["albumArtist"] = await string([.iTunesMetadataAlbumArtist, .id3MetadataBand])
    result["genre"] = await string([.iTunesMetadataUserGenre, .id3MetadataContentType, .commonIdentifierType])
    result["composer"] = await string([.iTunesMetadataComposer, .id3MetadataComposer])

    if let year = await string([.id3MetadataYear, .id3MetadataRecordingTime, .iTunesMetadataReleaseDate, .commonIdentifierCreationDate]),
       let parsed = Int(year.prefix(4)) {
      result["year"] = parsed
    }

    if let track = await numberPair(first([.iTunesMetadataTrackNumber, .id3MetadataTrackNumber])) {
      result["trackNumber"] = track
    }
    if let disc = await numberPair(first([.iTunesMetadataDiscNumber, .id3MetadataPartOfASet])) {
      result["discNumber"] = disc
    }

    if let artworkURL,
       let artItem = first([.commonIdentifierArtwork, .id3MetadataAttachedPicture, .iTunesMetadataCoverArt]),
       let data = try? await artItem.load(.dataValue),
       saveArtwork(data: data, to: artworkURL) {
      result["artworkPath"] = artworkURL.absoluteString
    }

    return result
  }

  /// Track and disc numbers are stored either as "3/12" strings (ID3) or as binary pairs (MP4).
  private static func numberPair(_ item: AVMetadataItem?) async -> Int? {
    guard let item else { return nil }
    if let string = try? await item.load(.stringValue) {
      let first = string.split(separator: "/").first.map(String.init) ?? string
      if let n = Int(first.trimmingCharacters(in: .whitespaces)), n > 0 { return n }
    }
    if let number = try? await item.load(.numberValue), number.intValue > 0 {
      return number.intValue
    }
    if let data = try? await item.load(.dataValue), data.count >= 4 {
      let n = Int(data[data.startIndex + 2]) << 8 | Int(data[data.startIndex + 3])
      return n > 0 ? n : nil
    }
    return nil
  }

  /// Downscales embedded artwork to at most 1200 px and saves it as JPEG.
  private static func saveArtwork(data: Data, to url: URL) -> Bool {
    guard let source = CGImageSourceCreateWithData(data as CFData, nil) else { return false }
    let options: [CFString: Any] = [
      kCGImageSourceCreateThumbnailFromImageAlways: true,
      kCGImageSourceCreateThumbnailWithTransform: true,
      kCGImageSourceThumbnailMaxPixelSize: 1200,
    ]
    guard let cgImage = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else { return false }
    guard let jpeg = UIImage(cgImage: cgImage).jpegData(compressionQuality: 0.9) else { return false }
    do {
      try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
      try jpeg.write(to: url, options: .atomic)
      return true
    } catch {
      return false
    }
  }
}
