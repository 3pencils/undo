import Foundation

/// Decides whether Undo's scripts may be installed for a page.
///
/// Instagram serves login, two-factor and password recovery under `/accounts/`.
/// Undo's code stays off those pages, so the app holds no position from which it
/// could read a password. Anything that is not an ordinary web page with a path
/// is treated as guarded, so the failure mode is no injection.
public enum InjectionPolicy {
    public static let guardedPrefixes = ["/accounts/"]

    public static func allowsInjection(path: String) -> Bool {
        let path = PathPolicy.normalize(path)
        return !guardedPrefixes.contains { path.hasPrefix($0) }
    }

    public static func allowsInjection(url: URL?) -> Bool {
        // The scheme and the leading slash both matter. `about:blank` parses with
        // a path of "blank", which is not a site path and must not be treated
        // as one.
        guard let url,
              let scheme = url.scheme?.lowercased(),
              scheme == "http" || scheme == "https",
              let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
              components.path.hasPrefix("/")
        else { return false }
        return allowsInjection(path: components.path)
    }
}
