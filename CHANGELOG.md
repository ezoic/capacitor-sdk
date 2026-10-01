# Changelog

All notable changes to `@ezoic/capacitor-sdk` are documented here. The plugin
version tracks the native Ezoic Ads SDKs it wraps (Swift and Kotlin) in
lockstep.

## 1.13.0

Initial release, wrapping Ezoic Ads SDK 1.13.0 for iOS and Android.

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
