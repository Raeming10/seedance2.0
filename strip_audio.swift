import AVFoundation
import Foundation

func fail(_ message: String) -> Never {
    FileHandle.standardError.write(Data((message + "\n").utf8))
    exit(1)
}

guard CommandLine.arguments.count == 3 else {
    fail("Usage: strip_audio.swift <input-video> <output-video>")
}

@available(macOS 15.0, *)
func stripAudio(inputURL: URL, outputURL: URL) async throws {
    let asset = AVURLAsset(url: inputURL)
    guard let sourceVideoTrack = try await asset.loadTracks(withMediaType: .video).first else {
        throw NSError(domain: "H3AudioStripper", code: 1, userInfo: [
            NSLocalizedDescriptionKey: "The source file has no video track.",
        ])
    }
    let duration = try await asset.load(.duration)
    let preferredTransform = try await sourceVideoTrack.load(.preferredTransform)
    let composition = AVMutableComposition()
    guard let outputVideoTrack = composition.addMutableTrack(
        withMediaType: .video,
        preferredTrackID: kCMPersistentTrackID_Invalid
    ) else {
        throw NSError(domain: "H3AudioStripper", code: 2, userInfo: [
            NSLocalizedDescriptionKey: "Could not create the output video track.",
        ])
    }
    try outputVideoTrack.insertTimeRange(
        CMTimeRange(start: .zero, duration: duration),
        of: sourceVideoTrack,
        at: .zero
    )
    outputVideoTrack.preferredTransform = preferredTransform

    try? FileManager.default.removeItem(at: outputURL)
    guard let exporter = AVAssetExportSession(
        asset: composition,
        presetName: AVAssetExportPresetPassthrough
    ) else {
        throw NSError(domain: "H3AudioStripper", code: 3, userInfo: [
            NSLocalizedDescriptionKey: "Could not create an AVAsset export session.",
        ])
    }
    exporter.shouldOptimizeForNetworkUse = true
    try await exporter.export(to: outputURL, as: .mp4)
}

guard #available(macOS 15.0, *) else {
    fail("Removing H3 audio requires macOS 15 or newer.")
}

let inputURL = URL(fileURLWithPath: CommandLine.arguments[1])
let outputURL = URL(fileURLWithPath: CommandLine.arguments[2])
Task {
    do {
        try await stripAudio(inputURL: inputURL, outputURL: outputURL)
        exit(0)
    } catch {
        fail("Could not remove the H3 audio track: \(error.localizedDescription)")
    }
}
dispatchMain()
