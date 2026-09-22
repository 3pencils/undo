import SwiftUI

struct RootView: View {
    private let platforms: [Platform] = [.instagram]

    var body: some View {
        // A tab bar with one tab is a strip of screen that says "Instagram"
        // above Instagram. Tabs arrive when the second platform does.
        if platforms.count == 1, let only = platforms.first {
            WebTab(platform: only)
        } else {
            TabView {
                ForEach(platforms) { platform in
                    WebTab(platform: platform)
                        .ignoresSafeArea(.container, edges: .bottom)
                        .tabItem { Label(platform.title, systemImage: platform.systemImage) }
                }
            }
        }
    }
}
