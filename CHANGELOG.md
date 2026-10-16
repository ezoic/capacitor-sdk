# Changelog

All notable changes to `@ezoic/capacitor-sdk` are documented here. The plugin
version tracks the native Ezoic Ads SDKs it wraps (Swift and Kotlin) in
lockstep.

## 1.16.0

Wraps Ezoic Ads SDK 1.16.0. `EzoicBannerAd.create` adds optional
`refreshIntervalSeconds` (0 = off, minimum 30) and `refreshMaxCount` (0 = no
limit, maximum 100); leave them out to follow the Ezoic server setting. Banner
refresh is off unless the server or the app turns it on. Ad loading timeouts,
retry limits and full-screen ad expiry can now be tuned from Ezoic's servers,
within safe limits; without server settings the behavior matches 1.15.0.
Invalid-request and missing-app-id errors now stop a load instead of retrying.

Fix: the banner `size` option was ignored on Android and iOS (the native side
expected an array while the plugin sends a string), so every banner loaded the
adaptive size. `size` is now honored.

## 1.15.0

Wraps Ezoic Ads SDK 1.15.0. Google Mobile Ads moves to 25.2.0 on Android and
13.x on iOS (Google Mobile Ads 22.x for Android is past Google's sunset date).
iOS builds need Xcode 26.2 or later. The plugin's default Kotlin version moves
to 2.1.21, the minimum for Google Mobile Ads 25.2.0; apps that set
`kotlin_version` in their root `build.gradle` must use 2.1 or later.
Header-bidding targeting is attached only when the bid clears the floor of each
waterfall step. No plugin API changes.

## 1.13.2

Wraps Ezoic Ads SDK 1.13.2. Header-bidding requests now identify Google Mobile
Ads and its runtime version as the display manager (OpenRTB
`imp.displaymanager` / `imp.displaymanagerver`). No plugin API changes.

## 1.13.1

Initial release, wrapping Ezoic Ads SDK 1.13.1 for iOS and Android. (1.13.0
was never published; the first npm release is 1.13.1 so the plugin and the
native SDKs share a version.)

- `EzoicAds` facade: `initialize`, `trackPageview`, `setSubjectToCOPPA`,
  `setGDPRConsent`, `setGPPConsent`, `presentConsentIfRequired`,
  `presentConsentSettings`, `isConsentRequired`, `resetConsent`.
- Built-in CMP: `autoPresentConsent` (default `true`) shows the consent
  dialog once after a successful `initialize`.
- `EzoicBannerAd`, `EzoicOutstreamAd` and `EzoicNativeAd`: native views
  overlaid on the WebView with `top` / `bottom` / `inline` placements, or
  pinned to a DOM element with `attachTo(element)`.
- `EzoicRewardedAd` and `EzoicInterstitialAd`: single-use full-screen ads
  with a `show()` promise that settles on dismiss.
- `EzoicInstreamAd`: VAST ad tag URLs for in-app video players, with
  waterfall fallback via `getNextAdTagUrl()` and `reportImpression()`.
- `EzoicErrorCode.consentRequired` (`5001`) and `getEzoicErrorCode(error)`.
- Web: every method is a safe no-op (ads are iOS/Android only).
