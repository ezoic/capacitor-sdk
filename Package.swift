// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "EzoicCapacitorSdk",
    platforms: [.iOS(.v15)],
    products: [
        .library(
            name: "EzoicCapacitorSdk",
            targets: ["EzoicAdsPlugin"])
    ],
    dependencies: [
        // Capacitor 7 and 8 share the same plugin API this package uses.
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", "7.0.0" ..< "9.0.0"),
        // Native Ezoic Ads SDK (pre-built XCFramework + Prebid / GMA / APS
        // transitive packages). Kept in lockstep with the plugin version.
        .package(url: "https://github.com/ezoic/ezoic-swift-sdk-dist.git", from: "1.13.1"),
        // The native-ad template imports GoogleMobileAds directly
        // (NativeAdView, MediaView, NativeAd). GMA 12 to match the SDK.
        .package(
            url: "https://github.com/googleads/swift-package-manager-google-mobile-ads.git",
            "12.0.0" ..< "13.0.0"
        )
    ],
    targets: [
        .target(
            name: "EzoicAdsPlugin",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm"),
                .product(name: "EzoicAdsSDK", package: "ezoic-swift-sdk-dist"),
                .product(name: "GoogleMobileAds", package: "swift-package-manager-google-mobile-ads")
            ],
            path: "ios/Sources/EzoicAdsPlugin")
    ]
)
