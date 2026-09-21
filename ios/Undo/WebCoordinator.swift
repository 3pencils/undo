import UIKit
import WebKit

/// Owns one platform's web view: what it loads and what it refuses to load.
@MainActor
final class WebCoordinator: NSObject {
    let platform: Platform

    init(platform: Platform) {
        self.platform = platform
    }

    /// Prepares the web view and loads the platform's home page.
    func start(_ webView: WKWebView) {
        webView.load(URLRequest(url: platform.homeURL))
    }
}

extension WebCoordinator: WKNavigationDelegate {
}
