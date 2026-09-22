import Foundation
import Testing
@testable import UndoKit

/// The repo root, found by walking up from this file:
/// UndoKitTests -> Tests -> UndoKit -> ios -> repo root.
func repoRoot(file: String = #filePath) -> URL {
    URL(fileURLWithPath: file)
        .deletingLastPathComponent()
        .deletingLastPathComponent()
        .deletingLastPathComponent()
        .deletingLastPathComponent()
        .deletingLastPathComponent()
}

func engineData(_ relativePath: String) throws -> Data {
    try Data(contentsOf: repoRoot().appending(path: "engine/" + relativePath))
}

@Test func decodesTheShippedPathRules() throws {
    let rules = try EngineConfig.decodePathRules(engineData("instagram/paths.json"))
    #expect(rules.blocked.contains("/reels/"))
    #expect(rules.blocked.contains("/explore/"))
    #expect(rules.allowed.contains("/reel/"))
    #expect(rules.allowed.contains("/explore/search/"))
    #expect(rules.guarded.contains("/accounts/"))
    #expect(rules.guarded.contains("/challenge/"))
}

@Test func theShippedPathRulesBlockWhatTheySay() throws {
    let policy = try PathPolicy(rules: EngineConfig.decodePathRules(engineData("instagram/paths.json")))
    #expect(policy.isBlocked("/reels/"))
    #expect(policy.isBlocked("/explore/"))
    #expect(policy.isBlocked("/explore/search/") == false)
    #expect(policy.isBlocked("/reel/ABC123/") == false)
    #expect(policy.isBlocked("/accounts/login/") == false)
}

@Test func decodesTheShippedFeedRules() throws {
    let rules = try EngineConfig.decodeFeedRules(engineData("instagram/feed.json"))
    #expect(rules.articleSelector == "article")
    #expect(rules.feedRootSelector == "main")
    // "Ad" is the label Instagram's mobile web actually uses, and it is matched
    // whole rather than as a substring, so it belongs in this list and not the other.
    #expect(rules.hideIfExactText.contains("Ad"))
    #expect(rules.hideIfTextContains.contains("Suggested for you"))
}

@Test func buildsAOneLineJSONLiteralForInjection() throws {
    let literal = try EngineConfig.feedRulesJSONLiteral(engineData("instagram/feed.json"))
    #expect(literal.contains("\"articleSelector\":\"article\""))
    #expect(literal.contains("\n") == false)
}

@Test func rejectsMalformedEngineData() {
    #expect(throws: (any Error).self) {
        _ = try EngineConfig.decodeFeedRules(Data("{\"articleSelector\":\"article\"}".utf8))
    }
}
