import SwiftUI

struct RootView: View {
    private let platforms: [Platform] = [.instagram]

    var body: some View {
        TabView {
            ForEach(platforms) { platform in
                WebTab(platform: platform)
                    .ignoresSafeArea(.container, edges: .bottom)
                    .tabItem { Label(platform.title, systemImage: platform.systemImage) }
            }
        }
    }
}
