import UIKit
import WebKit
import UndoKit

/// Owns one platform's web view: what it loads, what it refuses to load, and
/// where Undo's own scripts are allowed to run.
@MainActor
final class WebCoordinator: NSObject {
    let platform: Platform

    private let pathPolicy: PathPolicy
    private let userScripts: [WKUserScript]

    init(platform: Platform) {
        self.platform = platform
        self.pathPolicy = Self.loadPathPolicy(for: platform)
        self.userScripts = Self.loadUserScripts(for: platform)
        super.init()
    }

    func start(_ webView: WKWebView) {
        webView.load(URLRequest(url: platform.homeURL))
    }

    private static func loadPathPolicy(for platform: Platform) -> PathPolicy {
        guard let data = EngineBundle.data("\(platform.engineDirectory)/paths.json"),
              let rules = try? EngineConfig.decodePathRules(data)
        else {
            // A debug build stops here. A release build still browses, because an
            // app that blocks nothing beats an app that blocks everything.
            assertionFailure("engine/\(platform.engineDirectory)/paths.json is missing or malformed")
            return PathPolicy(blocked: [], allowed: [])
        }
        return PathPolicy(rules: rules)
    }

    private static func loadUserScripts(for platform: Platform) -> [WKUserScript] {
        guard let marker = EngineBundle.string("marker.js") else { return [] }
        return [
            WKUserScript(source: marker, injectionTime: .atDocumentStart, forMainFrameOnly: true)
        ]
    }

    /// Installs Undo's scripts for pages outside `/accounts/`, and removes them
    /// everywhere else. Called before each main-frame navigation begins, so a
    /// login page is loaded with no Undo code on it.
    private func applyInjectionGuard(for url: URL, on webView: WKWebView) {
        let controller = webView.configuration.userContentController
        controller.removeAllUserScripts()
        guard InjectionPolicy.allowsInjection(url: url) else { return }
        userScripts.forEach(controller.addUserScript)
    }
}

extension WebCoordinator: WKNavigationDelegate {
    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction
    ) async -> WKNavigationActionPolicy {
        guard let url = navigationAction.request.url else { return .cancel }

        // Sub-frames carry embeds and player chrome, and none of the rules here
        // are about them.
        let isMainFrame = navigationAction.targetFrame?.isMainFrame ?? true
        guard isMainFrame else { return .allow }

        // A link out of the platform opens in the browser, which keeps Undo's own
        // traffic to the platform it embeds.
        guard platform.hosts(url) else {
            if navigationAction.navigationType == .linkActivated {
                await UIApplication.shared.open(url)
            }
            return .cancel
        }

        if pathPolicy.isBlocked(url.path) {
            // The magnifier in Instagram's bottom bar points at /explore/, so
            // cancelling that outright would take search with it. Search is what
            // people reach for that button for, so that is where it goes.
            if PathPolicy.normalize(url.path) == "/explore/", let search = platform.searchURL {
                webView.load(URLRequest(url: search))
            }
            return .cancel
        }

        applyInjectionGuard(for: url, on: webView)
        return .allow
    }
}
