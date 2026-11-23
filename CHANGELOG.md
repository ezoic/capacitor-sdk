# Changelog

All notable changes to `@ezoic/capacitor-sdk` are documented here. The plugin
version tracks the native Ezoic Ads SDKs it wraps (Swift and Kotlin) in
lockstep.

## 1.26.0

Wraps Ezoic Ads SDK 1.26.0 on Android and iOS. Swift Package Manager builds
resolve iOS 1.26.0 or a later 1.x. There was no `@ezoic/capacitor-sdk` 1.25.0,
so this release also carries the native 1.25.0 change, listed first.

- **From native 1.25.0: no Capacitor API change for rewarded ads.** The
  native SDKs deprecate the rewarded load method with an ad unit identifier.
  This Capacitor plugin still requires the number in
  `EzoicRewardedAd.load('123456')`; its API has not changed. The native SDKs
  ignore that number for rewarded ads, so existing calls continue to work.
- **From native 1.26.0: banner and outstream bid requests carry the on-screen
  position.** Banner and outstream bid requests now tell bidders where the ad
  sits on screen (OpenRTB `banner.pos`). The SDK measures the view when it asks
  for bids: in view is above the fold, off screen (further down a scroll view,
  another page) is below the fold, and an anchor reports header or footer. A
  view not yet in a window sends no position. Nothing to change in your app;
  ads placed in view get the stronger signal.
- Native pins: Android `com.ezoic.sdk:ezoic-ads-sdk:1.26.0` (with
  `ezoic-consent-core` and `ezoic-cmp-sdk` 1.26.0 transitively); iOS SPM
  `ezoic-swift-sdk-dist` from 1.26.0; CocoaPods vendors the 1.26.0
  `EzoicAdsSDKBinary`, `EzoicConsentCoreBinary` and `EzoicCmpSDKBinary`
  XCFrameworks.

## 1.24.0

Wraps Ezoic Ads SDK 1.24.0 on Android and iOS: all Ezoic SDKs now share one
version. Swift Package Manager builds resolve iOS 1.24.0 or a later 1.x.

- **Removable built-in CMP (Android).** Apps that use another CMP can take the
  Ezoic CMP's code out of the Android app with a Gradle exclude in
  `android/app/build.gradle`, next to `cmpEnabled: false`:

  ```groovy
  configurations.all {
      exclude group: 'com.ezoic.sdk', module: 'ezoic-cmp-sdk'
  }
  ```

  Without the CMP the SDK behaves exactly as with `cmpEnabled: false`. On iOS
  the CMP stays in the app; set `cmpEnabled: false` and it stays off. See
  [Using your own CMP](README.md#using-your-own-cmp).
- **New `EzoicAds.isBuiltInCmpIncluded()`** → `Promise<boolean>`: `false` when
  the app removed the CMP, `true` otherwise (whether or not it is enabled).
- The native consent types moved into a new consent-core library
  (`com.ezoic.sdk:ezoic-consent-core` on Android, transitive;
  `EzoicConsentCoreBinary` on iOS). With CocoaPods the pod now vendors that
  XCFramework too, and its Swift references the CMP so the static linker keeps
  it. Consent outcomes and their `failed` codes (1001, 2001, 4001, 5002) are
  unchanged.

## 1.22.3

Wraps Ezoic Ads SDK 1.22.3 on Android and 1.23.2 on iOS. Swift Package Manager
builds resolve iOS 1.23.2 or a later 1.x.

- **Interstitials.** An interstitial that Google renders is closed by the SDK
  once it has been in front for 20 seconds without being dismissed. `onDismissed`
  fires and `show()` resolves as usual. Only the time the ad is in front
  counts: a store page, a browser or the app being in the background pauses
  it. Rewarded ads are never closed this way. There is nothing to change in
  your app.

## 1.22.2

The first release since 1.21.0; Capacitor had no 1.22.0 or 1.22.1. Wraps Ezoic
Ads SDK 1.22.2 on Android and 1.23.1 on iOS (the native SDKs are now versioned
separately). Swift Package Manager builds resolve iOS 1.23.1 or a later 1.x.

- **Banner sizes.** A banner loaded without a size gets the largest standard
  size that fits the banner's width, not the screen's. Before, a banner
  narrower than a tablet or landscape screen could get a 728x90 it could not
  show in full. On Android, a banner won by a header bidding partner keeps its
  size instead of shrinking to about 1x1.

- **US-state privacy.** In the US states with consumer privacy laws, the
  built-in CMP now writes the IAB GPP keys for the user's state. It shows a
  non-blocking notice once per launch until the user chooses, and offers a "Do
  Not Sell My Information" choice. Ads never wait for it. There is nothing to
  call, and `cmpEnabled: false` turns it off along with the TCF dialog.
- **`presentConsentSettings()` is region-aware.** In GDPR regions it opens the
  TCF dialog as before. In covered US states it opens the US privacy settings:
  `decided` with `acceptAll` (not opted out) or `rejectAll` (opted out), or
  `dismissed`. Existing "Privacy settings" buttons work for US users without
  changes. The outcome types are unchanged.
- **New `EzoicAds.isPrivacyOptionsRequired()`.** It is `true` when your app
  should show a "Privacy choices" entry point, `null` while unknown.
- **New `EzoicAds.setAppContent({ language, genre })` and the `appPaid` init
  option.** They describe your app to bidders (OpenRTB `app.content`,
  `app.paid`).
- A `failed` consent outcome keeps its `{ type: 'failed', code, message }`
  shape and native codes (1001, 2001, 4001, 5002), although the native
  error type changed in 1.22.0.
- **CocoaPods.** The native SDK is no longer published to CocoaPods trunk. The
  pod now vendors the native `EzoicAdsSDKBinary` and `EzoicCmpSDKBinary`
  XCFrameworks, which ship in the npm package, so CocoaPods installs get native
  the same native SDK as SPM installs. If your `Podfile` lists the `EzoicAdsSDK` pod
  itself, remove it.
- **New package `@ezoic/capacitor-cmp-sdk`.** The same CMP, for Ezoic
  publishers whose app doesn't use Ezoic ads. Use one package, not both. It
  follows separately; it is not on npm yet. Apps using `@ezoic/capacitor-sdk`
  don't need it.

## 1.21.0

Wraps Ezoic Ads SDK 1.21.0 on iOS and Android.

Banners refresh automatically every 30 seconds, or at the interval Ezoic sets
for the placement. The `EzoicBannerAd.create` options `refreshIntervalSeconds`
and `refreshMaxCount` are deprecated and ignored; remove them from your app.

On Android, InMobi now joins Google Ad Manager auctions through GAM SDK
Bidding; the native SDK bundles Google's InMobi adapter, so there is nothing to
configure. Google Mobile Ads is updated to 25.5.0 and the plugin builds with
Kotlin 2.2.21 by default. Apps that set their own Kotlin version need Kotlin 2.2
or later: with Kotlin 2.1 the plugin fails to compile against Google Mobile Ads
25.5.0.

On iOS, with `debugEnabled`, `initialize` logs a warning when `Info.plist` has
no `SKAdNetworkItems`, is missing Google's (`cstr6suwn9.skadnetwork`) or
InMobi's (`wzmmz9fp6w.skadnetwork`) ID, or lists an ID with uppercase letters
(Apple ignores those). Swift Package Manager installs get native iOS SDK 1.21.0;
CocoaPods installs keep resolving `EzoicAdsSDK` from CocoaPods trunk (1.19.1
today).

## 1.20.0

Wraps Ezoic Ads SDK 1.20.0 on iOS, which only updates dependencies (Prebid
3.4.1, Amazon APS 5.6.6 from Amazon's Swift package, Google Mobile Ads 13). No
plugin API changes. Android still wraps Ezoic Ads SDK 1.19.1.

Swift Package Manager is now the recommended way to install the plugin on iOS;
see "Installation" in the README for migrating a CocoaPods project. CocoaPods
trunk becomes read-only on December 2, 2026, so CocoaPods installs stop
receiving native iOS SDK updates after the last release published before then.
The pod now accepts `EzoicAdsSDK` 1.19.1 or any later 1.x release.

## 1.19.1

Wraps Ezoic Ads SDK 1.19.1. Android release builds made with Android Gradle
Plugin 9 no longer crash at startup with "Failed to create an instance of
androidx.work.impl.WorkDatabase". On iOS, consent set with `setGDPRConsent` /
`setGPPConsent` now reaches Google Mobile Ads, IMA and Amazon.

## 1.19.0

Wraps Ezoic Ads SDK 1.19.0, which sends COPPA to Google Mobile Ads, IMA and
Amazon, keeps the device id only while consent allows storage, sends a launch
pageview for apps that initialize after their first screen, and no longer holds
ad requests for 2 s waiting on a pageview id.

- Fixed: after a WebView reload, Capacitor live update, hard navigation, or iOS
  reloading the page after its web process was killed, the previous page's ads
  stayed on screen and kept refreshing, and new ads failed with duplicate ids.
  Each page load now tears down the previous page's ads (Android also does this
  on page start and when the WebView renderer crashes). Ads don't survive a
  reload; recreate them after the page loads.
- Fixed: `EzoicAds.initialize` after a reload rejected with code 1002. It now
  resolves, and calls within one page share a single native initialization (the
  first config wins).
- Fixed (iOS): destroying a banner now destroys the native banner explicitly.

## 1.18.0

Wraps Ezoic Ads SDK 1.18.0. Native ads are now drawn by the native SDKs' shared
template (`EzoicNativeAdTemplateView`), so they look the same here as in Swift,
Kotlin, React Native and Flutter apps and gain an "Ad" attribution badge. New
`adStyle` option on `EzoicNativeAd.create` and a `setStyle(adStyle)` method
restyle the template: background, corner radius, padding, text colors and
sizes, call-to-action colors and radius, media height and the ad badge text
and colors. See "Styling native ads" in the README. The native SDKs also report
an outcome for every rewarded ad load.

## 1.17.0

Wraps Ezoic Ads SDK 1.17.0. Native ads (`EzoicNativeAd`) now register their
rendered view with the native SDK, so they are reported as viewed (at least half
on screen for one continuous second); no app changes needed. Ad reporting is
more complete: viewability for every format (interstitial and rewarded at
display), an outcome for every demand attempt including no-fills, Amazon fills,
and the floor that filled. Full-screen ads and returning from the background no
longer count as new pageviews. Known limitation: a `trackPageview` label for the
launch screen that arrives more than ~1 s after `initialize` completes (outside
a consent prompt) records a second launch pageview; label the launch screen
before `initialize` or as soon as it completes. No plugin API changes.

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
