import Foundation

/// Decides whether a URL path is one Undo refuses to open.
///
/// Prefixes are compared against a canonical form of the path, so `/reels`
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

    /// Gives a path a trailing slash, so a prefix match cannot stop mid-segment.
    public static func normalize(_ path: String) -> String {
        let path = path.isEmpty ? "/" : path
        return path.hasSuffix("/") ? path : path + "/"
    }

    /// Folds every spelling a server may answer to the same page: letter case,
    /// repeated slashes, `.` and `..` segments, and the trailing slash.
    ///
    /// Comparing raw paths answers "not blocked" for `/REELS/` and `//reels/`,
    /// which is a wrong answer for a blocker and a dangerous one for the guard in
    /// `InjectionPolicy` that shares this function. `..` never climbs above the
    /// root, because no server serves anything there.
    public static func canonical(_ path: String) -> String {
        var segments: [String] = []
        for segment in path.lowercased().split(separator: "/", omittingEmptySubsequences: true) {
            switch segment {
            case ".":
                continue
            case "..":
                if !segments.isEmpty { segments.removeLast() }
            default:
                segments.append(String(segment))
            }
        }
        return "/" + segments.map { $0 + "/" }.joined()
    }

    public func isBlocked(_ path: String) -> Bool {
        let path = Self.canonical(path)
        if allowed.contains(where: { path.hasPrefix($0) }) { return false }
        return blocked.contains(where: { path.hasPrefix($0) })
    }
}
