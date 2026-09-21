import SwiftUI
import WebKit

/// One platform's web view, as a SwiftUI view.
struct WebTab: UIViewRepresentable {
    let platform: Platform

    func makeCoordinator() -> WebCoordinator {
        WebCoordinator(platform: platform)
    }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        // The default data store is the persistent one, which is what keeps a
        // login, and its two-factor trust, alive across restarts.
        configuration.websiteDataStore = .default()
        configuration.allowsInlineMediaPlayback = true

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        webView.allowsBackForwardNavigationGestures = true
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        #if DEBUG
        // Lets Safari's Develop menu open the live DOM inside the app, which is
        // how selectors get found and fixed.
        webView.isInspectable = true
        #endif

        context.coordinator.start(webView)
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {}
}
