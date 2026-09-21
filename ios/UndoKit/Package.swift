// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "UndoKit",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [.library(name: "UndoKit", targets: ["UndoKit"])],
    targets: [
        .target(name: "UndoKit"),
        .testTarget(name: "UndoKitTests", dependencies: ["UndoKit"]),
    ]
)
