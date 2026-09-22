import Foundation

/// One embedded platform: where it lives, which engine folder filters it, and
/// which hosts belong to it.
struct Platform: Identifiable, Hashable, Sendable {
    let id: String
    let title: String
    let systemImage: String
    let homeURL: URL
    /// Where the platform's search lives, for the redirect in `WebCoordinator`.
    let searchURL: URL?
    let engineDirectory: String
    let allowedHostSuffixes: [String]

    static let instagram = Platform(
        id: "instagram",
        title: "Instagram",
        systemImage: "camera",
        // The Following feed, not the algorithmic one. Instagram's default "For you"
        // feed injects suggested accounts by design, so asking for Following
        // removes them at the source instead of hiding them one phrase at a time.
        homeURL: URL(string: "https://www.instagram.com/?variant=following")!,
        searchURL: URL(string: "https://www.instagram.com/explore/search/"),
        engineDirectory: "instagram",
        allowedHostSuffixes: ["instagram.com", "cdninstagram.com", "fbcdn.net"]
    )

    /// True when this URL belongs to the platform, so the web view stays inside it.
    func hosts(_ url: URL) -> Bool {
        guard let host = url.host()?.lowercased() else { return false }
        return allowedHostSuffixes.contains { host == $0 || host.hasSuffix("." + $0) }
    }
}
