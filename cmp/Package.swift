// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "EzoicCapacitorCmpSdk",
    platforms: [.iOS(.v15)],
    products: [
        .library(
            name: "EzoicCapacitorCmpSdk",
            targets: ["EzoicCmpPlugin"])
    ],
    dependencies: [
        // Capacitor 7 and 8 share the same plugin API this package uses.
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", "7.0.0" ..< "9.0.0"),
        // The built-in CMP alone: the `EzoicCmpSDK` product of the same dist
        // package @ezoic/capacitor-sdk uses, so an app with both plugins links
        // one copy. Kept in lockstep with the plugin version.
        .package(url: "https://github.com/ezoic/ezoic-swift-sdk-dist.git", from: "1.22.0")
    ],
    targets: [
        .target(
            name: "EzoicCmpPlugin",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm"),
                .product(name: "EzoicCmpSDK", package: "ezoic-swift-sdk-dist")
            ],
            path: "ios/Sources/EzoicCmpPlugin")
    ]
)
