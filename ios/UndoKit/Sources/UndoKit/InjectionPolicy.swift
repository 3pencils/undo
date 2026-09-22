import Foundation

/// Decides whether Undo's scripts may be installed for a page.
///
/// Instagram serves login, two-factor and password recovery under `/accounts/`.
/// Undo's code stays off those pages, so the app holds no position from which it
/// could read a password.
///
/// The comparison is deliberately paranoid. A server may answer to more than one
/// spelling of the same path, and a guard that compares raw bytes says "inject"
/// for `/ACCOUNTS/login/`, `//accounts/login/` and `/x/../accounts/login/`. Paths
/// are standardized and folded before they are matched, and anything that is not
/// an ordinary web page with a path is treated as guarded, so the failure mode is
/// always no injection.
public struct InjectionPolicy: Sendable, Equatable {
    /// Instagram asks for credentials on more than `/accounts/`: a suspicious-login
    /// checkpoint lives under `/challenge/`, and two-factor, signup, recovery and
    /// OAuth each have their own path. Undo stays off all of them.
    public let guardedPrefixes: [String]

    public init(guardedPrefixes: [String]) {
        self.guardedPrefixes = guardedPrefixes
    }

    public init(rules: PathRules) {
        self.init(guardedPrefixes: rules.guarded)
    }

    public func allowsInjection(path: String) -> Bool {
        let path = PathPolicy.canonical(path)
        return !guardedPrefixes.contains { path.hasPrefix($0) }
    }

    public func allowsInjection(url: URL?) -> Bool {
        guard let url,
              let scheme = url.scheme?.lowercased(),
              scheme == "http" || scheme == "https",
              let components = URLComponents(url: url.standardized, resolvingAgainstBaseURL: false),
              components.path.hasPrefix("/")
        else { return false }
        return allowsInjection(path: components.path)
    }
}
