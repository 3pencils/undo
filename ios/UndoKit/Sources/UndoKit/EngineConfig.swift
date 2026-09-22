import Foundation

/// The blocked and allowed path prefixes, as shipped in `engine/<platform>/paths.json`.
public struct PathRules: Codable, Sendable, Equatable {
    public let blocked: [String]
    public let allowed: [String]
    /// Paths Undo's own scripts stay off. Instagram asks for credentials on more
    /// than one of them, and the page filter needs the same list the app uses.
    public let guarded: [String]

    public init(blocked: [String], allowed: [String], guarded: [String]) {
        self.blocked = blocked
        self.allowed = allowed
        self.guarded = guarded
    }
}

/// The feed heuristics, as shipped in `engine/<platform>/feed.json`.
public struct FeedRules: Codable, Sendable, Equatable {
    public let hideIfTextContains: [String]
    public let hideIfExactText: [String]
    public let articleSelector: String
    public let feedRootSelector: String
    /// Where Instagram's Home button should go.
    public let homeFeedHref: String

    public init(
        hideIfTextContains: [String],
        hideIfExactText: [String],
        articleSelector: String,
        feedRootSelector: String,
        homeFeedHref: String
    ) {
        self.hideIfTextContains = hideIfTextContains
        self.hideIfExactText = hideIfExactText
        self.articleSelector = articleSelector
        self.feedRootSelector = feedRootSelector
        self.homeFeedHref = homeFeedHref
    }
}

/// The data-layer rules, as shipped in `engine/<platform>/prune.json`.
public struct PruneRules: Codable, Sendable, Equatable {
    public struct Rule: Codable, Sendable, Equatable {
        public let container: String
        public let array: String
        /// The substring that makes a payload worth walking at all.
        public let gate: String
        /// How many items survive. Zero empties the array; one leaves the item
        /// that was asked for and drops the queue behind it.
        public let keep: Int

        public init(container: String, array: String, gate: String, keep: Int) {
            self.container = container
            self.array = array
            self.gate = gate
            self.keep = keep
        }
    }

    public let depthLimit: Int
    public let rules: [Rule]

    public init(depthLimit: Int, rules: [Rule]) {
        self.depthLimit = depthLimit
        self.rules = rules
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

    public static func decodePruneRules(_ data: Data) throws -> PruneRules {
        try JSONDecoder().decode(PruneRules.self, from: data)
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
