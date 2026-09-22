import UIKit
import WebKit
import UndoKit

/// Owns one platform's web view: what it loads, what it refuses to load, and
/// where Undo's own scripts are allowed to run.
@MainActor
final class WebCoordinator: NSObject {
    let platform: Platform

    private let pathPolicy: PathPolicy
    private let injectionPolicy: InjectionPolicy
    private let userScripts: [WKUserScript]

    init(platform: Platform) {
        self.platform = platform
        let rules = Self.loadPathRules(for: platform)
        self.pathPolicy = PathPolicy(rules: rules)
        self.injectionPolicy = InjectionPolicy(rules: rules)
        self.userScripts = Self.loadUserScripts(for: platform)
        super.init()
    }

    func start(_ webView: WKWebView) {
        webView.load(URLRequest(url: platform.homeURL))
    }

    private static func loadPathRules(for platform: Platform) -> PathRules {
        guard let data = EngineBundle.data("\(platform.engineDirectory)/paths.json"),
              let rules = try? EngineConfig.decodePathRules(data)
        else {
            // A debug build stops here. A release build blocks nothing but guards
            // everything: an app that filters nothing beats one that leaks a script
            // onto a login page.
            assertionFailure("engine/\(platform.engineDirectory)/paths.json is missing or malformed")
            return PathRules(blocked: [], allowed: [], guarded: ["/"])
        }
        return rules
    }

    private static func loadUserScripts(for platform: Platform) -> [WKUserScript] {
        var scripts: [WKUserScript] = []

        // First, and before any of Instagram's own code runs: the data filter. An
        // advert emptied out of the payload is never drawn, so nothing downstream
        // has to find it, hide it, or re-decide it on every mutation.
        if let data = EngineBundle.data("\(platform.engineDirectory)/prune.json"),
           let rules = try? EngineConfig.decodePruneRules(data),
           let config = try? ScriptBuilder.pruneConfigScript(
               rules: rules,
               guardedPrefixes: Self.loadPathRules(for: platform).guarded
           ),
           let prune = EngineBundle.string("\(platform.engineDirectory)/prune.js") {
            scripts.append(
                WKUserScript(source: config, injectionTime: .atDocumentStart, forMainFrameOnly: true)
            )
            scripts.append(
                WKUserScript(source: prune, injectionTime: .atDocumentStart, forMainFrameOnly: true)
            )
        } else {
            assertionFailure("engine/\(platform.engineDirectory)/prune.json or prune.js is missing")
        }

        if let marker = EngineBundle.string("marker.js") {
            scripts.append(
                WKUserScript(source: marker, injectionTime: .atDocumentStart, forMainFrameOnly: true)
            )
        }

        // At document start, so the elements it hides are never painted.
        if let css = EngineBundle.string("\(platform.engineDirectory)/hide.css"),
           let source = try? ScriptBuilder.styleInjector(css: css, id: "undo-static-hides") {
            scripts.append(
                WKUserScript(source: source, injectionTime: .atDocumentStart, forMainFrameOnly: true)
            )
        } else {
            assertionFailure("engine/\(platform.engineDirectory)/hide.css is missing")
        }

        // The filter's selectors, phrases and the guarded paths, handed over as a
        // global. Round-tripping through FeedRules means only known keys reach the page.
        if let data = EngineBundle.data("\(platform.engineDirectory)/feed.json"),
           let feedRules = try? EngineConfig.decodeFeedRules(data),
           let source = try? ScriptBuilder.configScript(
               feedRules: feedRules,
               guardedPrefixes: Self.loadPathRules(for: platform).guarded
           ) {
            scripts.append(
                WKUserScript(source: source, injectionTime: .atDocumentStart, forMainFrameOnly: true)
            )
        } else {
            assertionFailure("engine/\(platform.engineDirectory)/feed.json is missing or malformed")
        }

        if let filter = EngineBundle.string("\(platform.engineDirectory)/filter.js") {
            scripts.append(
                WKUserScript(source: filter, injectionTime: .atDocumentEnd, forMainFrameOnly: true)
            )
        }

        return scripts
    }

    /// Installs Undo's scripts for pages outside `/accounts/`, and removes them
    /// everywhere else. Called before each main-frame navigation begins, so a
    /// login page is loaded with no Undo code on it.
    private func applyInjectionGuard(for url: URL, on webView: WKWebView) {
        let controller = webView.configuration.userContentController
        controller.removeAllUserScripts()
        guard injectionPolicy.allowsInjection(url: url) else { return }
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
