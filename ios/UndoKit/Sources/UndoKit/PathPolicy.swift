import Foundation

/// Decides whether a URL path is one Undo refuses to open.
///
/// Prefixes are compared against a path that always ends in a slash, so `/reels`
/// and `/reels/` are the same thing and `/reel/ABC/` never matches `/reels/`.
public struct PathPolicy: Sendable, Equatable {
    public let blocked: [String]
    public let allowed: [String]

    public init(blocked: [String], allowed: [String]) {
        self.blocked = blocked
        self.allowed = allowed
    }

    public init(rules: PathRules) {
        self.init(blocked: rules.blocked, allowed: rules.allowed)
    }

    public static func normalize(_ path: String) -> String {
        let path = path.isEmpty ? "/" : path
        return path.hasSuffix("/") ? path : path + "/"
    }

    public func isBlocked(_ path: String) -> Bool {
        let path = Self.normalize(path)
        if allowed.contains(where: { path.hasPrefix($0) }) { return false }
        return blocked.contains(where: { path.hasPrefix($0) })
    }
}
