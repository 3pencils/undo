import Foundation

/// The blocked and allowed path prefixes, as shipped in `engine/<platform>/paths.json`.
public struct PathRules: Codable, Sendable, Equatable {
    public let blocked: [String]
    public let allowed: [String]

    public init(blocked: [String], allowed: [String]) {
        self.blocked = blocked
        self.allowed = allowed
    }
}

/// The feed heuristics, as shipped in `engine/<platform>/feed.json`.
public struct FeedRules: Codable, Sendable, Equatable {
    public let hideIfLinkPrefix: [String]
    public let hideIfTextContains: [String]
    public let articleSelector: String
    public let feedRootSelector: String

    public init(
        hideIfLinkPrefix: [String],
        hideIfTextContains: [String],
        articleSelector: String,
        feedRootSelector: String
    ) {
        self.hideIfLinkPrefix = hideIfLinkPrefix
        self.hideIfTextContains = hideIfTextContains
        self.articleSelector = articleSelector
        self.feedRootSelector = feedRootSelector
    }
}

/// Turns the bundled engine files into Swift values.
///
/// Decoding is strict on purpose: a missing key throws rather than falling back to
/// a default, so a mistake in `engine/` surfaces at launch in a debug build
/// instead of quietly turning a filter off.
public enum EngineConfig {
    public static func decodePathRules(_ data: Data) throws -> PathRules {
        try JSONDecoder().decode(PathRules.self, from: data)
    }

    public static func decodeFeedRules(_ data: Data) throws -> FeedRules {
        try JSONDecoder().decode(FeedRules.self, from: data)
    }

    /// The feed rules as compact JSON, ready to assign to a global in an injected script.
    /// Round-tripping through `FeedRules` means only known keys reach the page.
    public static func feedRulesJSONLiteral(_ data: Data) throws -> String {
        let rules = try decodeFeedRules(data)
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
        return String(decoding: try encoder.encode(rules), as: UTF8.self)
    }
}
