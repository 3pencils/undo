import UIKit
import WebKit
import UndoKit
#if DEBUG
import OSLog
#endif

/// Owns one platform's web view: what it loads, what it refuses to load, and
/// where Undo's own scripts are allowed to run.
@MainActor
final class WebCoordinator: NSObject {
    let platform: Platform

    private let pathPolicy: PathPolicy
    private let injectionPolicy: InjectionPolicy
    private let userScripts: [WKUserScript]

    #if DEBUG
    /// Debug builds narrate where the web view goes, so a screen reached by a
    /// route Undo does not yet know about can be identified by its URL rather
    /// than guessed at from a screenshot. Compiled out of release builds, and it
    /// writes to the local system log only: nothing leaves the device.
    private static let navigationLog = Logger(subsystem: "com.3pencils.undo", category: "navigation")
    private var urlObservation: NSKeyValueObservation?
    private var probe: Task<Void, Never>?
    #endif

    init(platform: Platform) {
        self.platform = platform
        let rules = Self.loadPathRules(for: platform)
        self.pathPolicy = PathPolicy(rules: rules)
        self.injectionPolicy = InjectionPolicy(rules: rules)
        self.userScripts = Self.loadUserScripts(for: platform)
        super.init()
    }

    func start(_ webView: WKWebView) {
        #if DEBUG
        // Instagram moves between pages without loading one, and those hops never
        // reach the navigation delegate. Watching the url property catches them.
        urlObservation = webView.observe(\.url, options: [.new]) { _, change in
            guard let url = change.newValue ?? nil else { return }
            Self.navigationLog.notice("same-document -> \(url.absoluteString, privacy: .public)")
        }
        #endif
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
           let config = try? ScriptBuilder.pruneConfigScript(rules: rules),
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
    #if DEBUG
    /// Reports what is on screen every few seconds, so a screen Undo does not yet
    /// recognise can be identified without a screenshot. Debug builds only.
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        guard probe == nil else { return }
        probe = Task { @MainActor [weak webView] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(3))
                guard let webView else { return }
                let script = """
                (function () {
                  function texts(selector, limit) {
                    var out = [], nodes = document.querySelectorAll(selector);
                    for (var i = 0; i < nodes.length && out.length < limit; i += 1) {
                      var t = (nodes[i].textContent || '').trim();
                      if (t && t.length < 30) out.push(t);
                    }
                    return out;
                  }
                  var articles = document.querySelectorAll('main article');
                  var hidden = 0;
                  for (var i = 0; i < articles.length; i += 1) {
                    if (articles[i].style.display === 'none') hidden += 1;
                  }
                  var adLabels = 0, all = document.querySelectorAll('span, div');
                  for (var j = 0; j < all.length; j += 1) {
                    if (all[j].children.length === 0 && (all[j].textContent || '').trim() === 'Ad') adLabels += 1;
                  }
                  return [
                    'path=' + location.pathname + location.search,
                    'articles=' + articles.length,
                    'hidden=' + hidden,
                    'videos=' + document.querySelectorAll('video').length,
                    'adLabels=' + adLabels,
                    'dialogs=' + document.querySelectorAll('[role="dialog"]').length,
                    'buttons=[' + texts('button', 6).join('|') + ']',
                    'headings=[' + texts('h1, h2, header span, header div', 4).join('|') + ']',
                    'pruned=' + (window.__undoPruned
                      ? window.__undoPruned.seen + '/' + window.__undoPruned.pruned : 'ABSENT'),
                    'fields=[' + (window.__undoPruned
                      ? Object.keys(window.__undoPruned.fields).join('|') : '') + ']'
                  ].join(' ');
                })()
                """
                if let value = try? await webView.evaluateJavaScript(script) {
                    Self.navigationLog.notice("screen \(String(describing: value), privacy: .public)")
                }
            }
        }
    }
    #endif

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

        #if DEBUG
        Self.navigationLog.notice(
            "navigate \(String(describing: navigationAction.navigationType.rawValue), privacy: .public) -> \(url.absoluteString, privacy: .public) [blocked=\(self.pathPolicy.isBlocked(url.path), privacy: .public) inject=\(self.injectionPolicy.allowsInjection(url: url), privacy: .public)]"
        )
        #endif

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
