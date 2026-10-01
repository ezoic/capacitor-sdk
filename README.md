# @ezoic/capacitor-sdk

Ezoic Ads SDK for Capacitor (Prebid + Google Ad Manager banner, native, interstitial, rewarded, outstream and instream video ads).

A thin Capacitor plugin over the native Ezoic Ads SDKs for iOS
(`EzoicAdsSDK`, via CocoaPods or Swift Package Manager) and Android
(`com.ezoic.sdk:ezoic-ads-sdk`, via Maven Central). It exposes an imperative
`EzoicAds` API, the `EzoicBannerAd`, `EzoicNativeAd` and `EzoicOutstreamAd`
overlay views, the `EzoicRewardedAd` and `EzoicInterstitialAd` full-screen ads,
and the `EzoicInstreamAd` controller. On the web every call is a safe no-op.

## Requirements

- Capacitor 7 or 8.
- iOS 15.0+ and Xcode 26+ (required by the native `EzoicAdsSDK` 1.13), Android `minSdk` 24+.

## Installation

```sh
npm install @ezoic/capacitor-sdk
npx cap sync
```

### iOS

The plugin's pod declares `static_framework = true`, so the native
`EzoicAdsSDK` binary (and its `PrebidMobile` / `GoogleMobileAds` dependencies)
link statically without changes to the `use_frameworks!` line Capacitor puts
in your `Podfile`. `npx cap sync` runs `pod install` for you.

Add your Google Ad Manager application ID to `ios/App/App/Info.plist`:

```xml
<key>GADApplicationIdentifier</key>
<string>ca-app-pub-xxxxxxxxxxxxxxxx~yyyyyyyyyy</string>
```

### Android

Add your Google Ad Manager application ID to
`android/app/src/main/AndroidManifest.xml` inside `<application>`:

```xml
<meta-data
    android:name="com.google.android.gms.ads.APPLICATION_ID"
    android:value="ca-app-pub-xxxxxxxxxxxxxxxx~yyyyyyyyyy" />
```

The plugin is written in Kotlin and declares its own Kotlin Gradle plugin, so
no changes to your app's Gradle files are needed.

## Usage

```ts
import { EzoicAds, EzoicBannerAd } from '@ezoic/capacitor-sdk';

// Initialize once, early in app startup. In GDPR regions the built-in consent
// dialog is presented automatically once this resolves (see "Privacy & consent").
await EzoicAds.initialize({ domain: 'example.com' });

// Optional privacy signals.
await EzoicAds.setGPPConsent('<GPP string>', '7');
await EzoicAds.setSubjectToCOPPA(false);

// Label the current screen in reporting (see "Pageview labelling").
const tracked = await EzoicAds.trackPageview('Home');

// A banner anchored to the bottom of the screen. It takes no space until a
// creative fills, and collapses again on no-fill (default).
const banner = await EzoicBannerAd.create({
  adUnitIdentifier: '123456',
  size: '320x50,300x250',
  placement: { position: 'bottom' },
});
banner.setListeners({
  onSizeChange: ({ width, height }) => console.log('size', width, height),
  onLoad: () => console.log('loaded'),
  onError: (e) => console.log('error', e.message, e.code),
  onImpression: () => console.log('impression'),
  onClick: () => console.log('click'),
  onOpen: () => console.log('open'),
  onClose: () => console.log('close'),
});
await banner.load();

// Later, when the screen goes away:
await banner.destroy();
```

`adUnitIdentifier` is a string (or number) coerced to a native integer. `size`
is a `"WxH"` string or comma-separated list (e.g. `"300x250"`,
`"300x250,320x50"`). `collapseOnNoFill` (default `true`) collapses the view to
height 0 when a load fails and nothing is displayed. `onSizeChange` receives
`{ width, height }` in CSS px after a fill, or `{ width: 0, height: 0 }` on
collapse.

### How ad views are shown

Capacitor renders your app in a WebView, and native ad views cannot live
inside the DOM. The plugin draws them on a transparent layer **over** the
WebView instead; taps outside an ad fall through to your page. Where a view
goes is its *placement*:

| Placement | |
|---|---|
| `{ position: 'bottom', margin?, width?, height? }` | Anchored to the bottom safe-area edge, horizontally centred. Default. |
| `{ position: 'top', margin?, width?, height? }` | Same, anchored to the top. |
| `{ position: 'inline', frame: { x, y, width, height } }` | An exact frame in CSS px relative to the viewport. |

Banners default to the creative's size; outstream and native views default to
full width and a height of 250 / 300 px. `setPlacement()` moves a view at any
time, and `hide()` / `show()` toggle it (e.g. while a modal is open).

For an ad that belongs *inside* your page, place an empty element where the
ad should appear and call `attachTo(element)`. The view follows the element's
bounding box through scrolling, resizing and layout changes, and — with
`autoHeight` (default) — the element's `height` is set from `onSizeChange`, so
your layout reflows around the filled creative and collapses when there is no
fill:

```ts
const slot = document.getElementById('ad-slot')!; // give it a width in CSS
const banner = await EzoicBannerAd.create({ adUnitIdentifier: '123456', size: '300x250' });
banner.attachTo(slot);
await banner.load();
```

Because the ad is drawn above the page, anything you render over that spot
(modals, drawers, sticky headers) will appear *behind* the ad. Call `hide()`
while such UI is open, or `destroy()` the view when its screen goes away.

### Native ads

`EzoicNativeAd` loads a native ad and renders it in an SDK-built template
(headline, icon, media, body and a call-to-action). It has no `size` option —
size it with the placement `height` / `width` (default 300 px tall, full
width) or with the attached element's box.

```ts
import { EzoicNativeAd } from '@ezoic/capacitor-sdk';

const nativeAd = await EzoicNativeAd.create({ adUnitIdentifier: '123456' });
nativeAd.setListeners({
  onLoad: () => console.log('loaded'),
  onError: (e) => console.log('error', e.message, e.code),
  onImpression: () => console.log('impression'),
  onClick: () => console.log('click'),
  onOpen: () => console.log('open'),
  onClose: () => console.log('close'),
});
nativeAd.attachTo(document.getElementById('native-slot')!);
await nativeAd.load();
```

### Outstream video

`EzoicOutstreamAd` loads and renders a self-contained outstream video ad. Like
the native ad it has no `size` option — the SDK lays the player out inside the
placement (default 250 px tall, full width) or the attached element's box.
Same `collapseOnNoFill` (default `true`) and `onSizeChange` as the banner.

```ts
import { EzoicOutstreamAd } from '@ezoic/capacitor-sdk';

const outstream = await EzoicOutstreamAd.create({
  adUnitIdentifier: '123456',
  placement: { position: 'top', margin: 8 },
});
outstream.setListeners({
  onSizeChange: ({ width, height }) => console.log('size', width, height),
  onLoad: () => console.log('loaded'),
  onError: (e) => console.log('error', e.message, e.code),
});
await outstream.load();
```

### Rewarded ads

```ts
import { EzoicRewardedAd } from '@ezoic/capacitor-sdk';

const ad = await EzoicRewardedAd.load('123456'); // rejects on no fill
ad.setListeners({
  onShown: () => console.log('shown'),
  onUserEarnedReward: (reward) => console.log('reward', reward.type, reward.amount),
  onDismissed: () => console.log('dismissed'),
});
const reward = await ad.show({ rewardName: 'coins' }); // resolves on dismiss
if (reward) grantCoins(reward.amount);
```

A rewarded ad is single-use: `show()` resolves with the earned `EzoicReward`
(or `null` if the user dismissed it early) once the ad closes, and rejects if
it could not be presented. Load a new one for the next show.

### Interstitial ads

```ts
import { EzoicInterstitialAd } from '@ezoic/capacitor-sdk';

const ad = await EzoicInterstitialAd.load('123456');
await ad.show(); // resolves on dismiss, rejects if it could not be presented
```

### Instream video

`EzoicInstreamAd` is a view-less controller for instream (pre/mid/post-roll)
video. **The host owns the video player and the Google IMA SDK** — the SDK
renders nothing; its sole deliverable is a GAM VAST ad-tag URL string you feed
to your own IMA `AdsRequest`. A controller is multi-use and prefetchable: it is
not auto-destroyed, so you `load()` it repeatedly and `destroy()` it yourself.

```ts
import { EzoicInstreamAd } from '@ezoic/capacitor-sdk';

const instream = new EzoicInstreamAd('123456');

// Resolve the VAST ad-tag URL and hand it to your IMA player.
const adTagUrl = await instream.load({ contentUrl: playingVideoUrl });
adsLoader.requestAds({ adTagUrl });

// On an IMA ad error, walk down the floor waterfall to the next tag.
const next = await instream.getNextAdTagUrl(); // null once exhausted
if (next) adsLoader.requestAds({ adTagUrl: next });

// On the IMA STARTED event, fire the Ezoic impression pixel.
await instream.reportImpression({ revenueUsd: 0.012 });

// Release the native controller when done.
await instream.destroy();
```

`load()` rejects on no fill, an uninitialized SDK, or an overlapping load
already in flight for this id; it is safe to call again after a previous load
resolves. `contentUrl` and `revenueUsd` are optional.

## Configuration

`EzoicAds.initialize(config)` accepts:

| Field | Default | |
|---|---|---|
| `domain` | (required) | Your Ezoic domain. |
| `autoReadConsent` | `true` | Read `IABTCF_*` / `IABGPP_*` consent keys written by a CMP. |
| `subjectToCOPPA` | `false` | Treat the user as subject to COPPA. |
| `requestATTBeforeAds` | `true` | iOS only: request App Tracking Transparency before the first ad. |
| `debugEnabled` | `false` | Verbose native logging. |
| `testMode` | `false` | Ezoic $0.00 test ads on debug builds / simulators. Disable before release. |
| `autoTrackPageviews` | `true` | Record a pageview automatically on native screen changes. See [Pageview labelling](#pageview-labelling). |
| `cmpEnabled` | `true` | Enable the built-in TCF CMP. Set `false` if you run your own CMP. |
| `autoPresentConsent` | `true` | Present the consent dialog (if required) right after `initialize` resolves. |

## Privacy & consent

### Built-in CMP (GDPR / TCF 2.4)

The native SDK includes an IAB TCF 2.4 consent management platform (CMP ID
299). It is on by default (`cmpEnabled: true`) and only does anything for users
in GDPR regions; elsewhere nothing is shown and ads load as before.

> **If your app already runs another CMP (UMP, OneTrust, …) you _must_ set
> `cmpEnabled: false`.** See [Using your own CMP](#using-your-own-cmp).

**The dialog is presented for you.** Once `initialize` resolves, the plugin
calls `presentConsentIfRequired()` once on your behalf (`autoPresentConsent:
true`). Outside GDPR regions, with `cmpEnabled: false`, when another CMP is
present, when you called `setGDPRConsent` before `initialize`, or with
`autoReadConsent: false`, the native SDK returns `notRequired` and nothing is
shown.

In GDPR regions, ad loads wait while the consent dialog is loading or on screen
(at most 5 minutes in total per dialog), and up to 10 seconds while no dialog is
in progress, the dialog is covered, or the app is in the background, then fail
with error code `5001` ([`EzoicErrorCode.consentRequired`](#error-code-5001)).
If native can't show the dialog at all (e.g. network error), it returns
`failed` with the native error code and ads proceed without a TC string
(limited ads). A `failed` outcome with `code: -1` is different: the plugin had
no foreground screen to present from, native was never called, and ads stay
gated (they wait up to 10 seconds, then fail with `5001`).

To control the timing or read the outcome, turn auto-presentation off and call
`presentConsentIfRequired()` yourself, e.g. from your first screen:

```ts
import { EzoicAds } from '@ezoic/capacitor-sdk';

await EzoicAds.initialize({ domain: 'example.com', autoPresentConsent: false });

const outcome = await EzoicAds.presentConsentIfRequired();
switch (outcome.type) {
  case 'decided':
    console.log('User chose', outcome.decision); // 'acceptAll' | 'rejectAll' | 'custom'
    break;
  case 'failed':
    console.log('Consent UI failed', outcome.code, outcome.message);
    break;
  default:
    break; // 'notRequired' | 'alreadyDecided' | 'dismissed' | 'alreadyPresenting'
}
```

`presentConsentIfRequired()` can be called at any time, and repeat calls are
harmless: you get `alreadyPresenting` while a dialog is in flight and
`alreadyDecided` once a valid decision is stored. Re-present whenever
`isConsentRequired()` is `true` and no decision has been made (e.g. after
`dismissed` or `failed`). Called before initialization finishes, it waits for
the init response.

The promise always resolves (never rejects) with an `EzoicConsentOutcome`:

| `type` | When |
|---|---|
| `notRequired` | GDPR doesn't apply, the built-in CMP is disabled, another CMP owns consent, or consent is managed by the app (`setGDPRConsent`, or `autoReadConsent: false`) |
| `alreadyDecided` | A still-valid decision is stored; no dialog shown |
| `decided` | The user chose `decision` (`acceptAll`, `rejectAll` or `custom`); the choice is saved |
| `dismissed` | The dialog closed without a choice; ads stay gated for this session |
| `alreadyPresenting` | A consent dialog is already on screen or being prepared |
| `failed` | The dialog couldn't be shown. `code`/`message` come from the native error. `code: -1` with `message: 'No foreground Activity'` (on both platforms) is plugin-side: there was no foreground Activity / view controller, native was not called and ads stay gated, so call `presentConsentIfRequired()` again once a screen is showing |

- **`isConsentRequired()`** resolves `true` whenever GDPR applies and the
  built-in CMP is in charge (including after the user has decided), `false`
  otherwise, and `null` until the init request completes or when the server
  sent no consent information.
- **`resetConsent()`** deletes the stored decision so the dialog shows again
  (ads re-gate until the user decides).

### Privacy settings button (required)

TCF policy requires users to be able to reopen the dialog and change or
withdraw consent at any time. Wire `presentConsentSettings()` to a menu item or
button that is always reachable:

```ts
document.getElementById('privacy-settings')!.addEventListener('click', () => {
  EzoicAds.presentConsentSettings();
});
```

It reopens the dialog with the user's stored choices in GDPR regions and
resolves `notRequired` elsewhere, with `cmpEnabled: false`, or when another CMP
is present.

### Using your own CMP

Set `cmpEnabled: false`. The SDK then reads your CMP's `IABTCF_*` (TCF) and
`IABGPP_*` (GPP) keys exactly as before. The built-in CMP also stays out of the
way automatically if it finds `IABTCF_CmpSdkID` set to another CMP's ID.

```ts
await EzoicAds.initialize({ domain: 'example.com', cmpEnabled: false });
```

### Manual consent

`setGDPRConsent` and the built-in CMP are mutually exclusive. The override
lasts for the current process only, so **call `setGDPRConsent` before
`initialize` on every launch** (or set `cmpEnabled: false`). Otherwise each cold
start begins with the built-in CMP in charge until your call lands: it can gate
ad loads, show its dialog and write `IABTCF_*` keys. The SDK doesn't write your
consent string to `IABTCF_*` keys for other SDKs, so your own CMP must do that.

```ts
await EzoicAds.setGDPRConsent(true, '<IAB TCF consent string>');
await EzoicAds.initialize({ domain: 'example.com', cmpEnabled: false });
```

### Error code 5001

When GDPR applies and the user hasn't decided, ad loads fail after the wait
described above with code `5001`, exported as `EzoicErrorCode.consentRequired`.
Consent is checked when an ad loads, so the code arrives as:

- `code` on the ad views' `onError` (banner, native, outstream);
- `getEzoicErrorCode(error)` on rejected rewarded, interstitial and instream
  `load()` promises (the rejection's `message` is the native one, "User consent
  is required to load ads.").

```ts
import { EzoicAds, EzoicBannerAd, EzoicErrorCode, EzoicRewardedAd, getEzoicErrorCode } from '@ezoic/capacitor-sdk';

const banner = await EzoicBannerAd.create({ adUnitIdentifier: '123456' });
banner.setListeners({
  onError: (e) => {
    if (e.code === EzoicErrorCode.consentRequired) {
      // The user hasn't decided yet; e.g. offer EzoicAds.presentConsentIfRequired().
    }
  },
});

try {
  const ad = await EzoicRewardedAd.load('123456');
  await ad.show();
} catch (e) {
  if (getEzoicErrorCode(e) === EzoicErrorCode.consentRequired) {
    await EzoicAds.presentConsentIfRequired();
  }
}
```

## Pageview labelling

Ezoic reports app traffic per *screen*, the way it reports a site per URL. Apps
have no URLs, so the SDK builds one from a label:
`https://<your domain>/<bundle id>/<screen label>`.

The native SDK tracks pageviews automatically, but it only sees native screens:
in a Capacitor app that is the single host Activity / view controller, so every
route lands in one bucket. Call `trackPageview(screen)` when the user reaches a
screen to give it a name. With a client-side router, do it on every route
change — for example with Vue Router:

```ts
import { EzoicAds } from '@ezoic/capacitor-sdk';

router.afterEach((to) => {
  EzoicAds.trackPageview(String(to.name ?? to.path));
});
```

or with Angular:

```ts
router.events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe((e) => {
  EzoicAds.trackPageview((e as NavigationEnd).urlAfterRedirects);
});
```

Labels are free text: use `/` for hierarchy (`members/profile`), spaces become
`-`, punctuation is dropped, case is kept. The label is also attached to every
ad request on that screen until the next pageview. A labelled pageview takes
precedence over the automatic one for the same navigation, so there is no
double counting. If you label every screen, set `autoTrackPageviews: false` so
pageviews come only from your calls. `trackPageview()` without a label records
an unlabelled pageview.

## API

- `EzoicAds.initialize(config)` → `Promise<void>` (see [Configuration](#configuration))
- `EzoicAds.setGDPRConsent(applies, consentString?)` → `Promise<void>` (call before `initialize`)
- `EzoicAds.setGPPConsent(gppString?, sectionIds?)` → `Promise<void>`
- `EzoicAds.setSubjectToCOPPA(value)` → `Promise<void>`
- `EzoicAds.trackPageview(screen?)` → `Promise<boolean>`
- `EzoicAds.presentConsentIfRequired()` → `Promise<EzoicConsentOutcome>`
- `EzoicAds.presentConsentSettings()` → `Promise<EzoicConsentOutcome>`
- `EzoicAds.isConsentRequired()` → `Promise<boolean | null>`
- `EzoicAds.resetConsent()` → `Promise<void>`
- `EzoicErrorCode.consentRequired` = `5001`; `getEzoicErrorCode(error)` → `number | undefined`
- `EzoicBannerAd.create({ adUnitIdentifier, size?, collapseOnNoFill?, placement? })`,
  `EzoicOutstreamAd.create({ adUnitIdentifier, collapseOnNoFill?, placement? })`,
  `EzoicNativeAd.create({ adUnitIdentifier, placement? })` → `Promise<view>`, each with
  - `.setListeners({ onLoad, onError, onImpression, onClick, onOpen, onClose, onSizeChange* })` (*banner / outstream only)
  - `.load()`, `.show()`, `.hide()`, `.setPlacement(placement)`, `.destroy()` → `Promise<void>`
  - `.attachTo(element, { autoHeight? })` → `() => void`, `.detach()`, `.getPlacement()`
- `EzoicRewardedAd.load(adUnitIdentifier)` → `Promise<EzoicRewardedAd>`
  - `.setListeners({ onShown, onFailedToShow, onImpression, onClicked, onUserEarnedReward, onDismissed })`
  - `.show({ rewardName? })` → `Promise<EzoicReward | null>`, `.destroy()` → `Promise<void>`
- `EzoicInterstitialAd.load(adUnitIdentifier)` → `Promise<EzoicInterstitialAd>`
  - `.setListeners({ onShown, onFailedToShow, onImpression, onClicked, onDismissed })`
  - `.show()` → `Promise<void>`, `.destroy()` → `Promise<void>`
- `new EzoicInstreamAd(adUnitIdentifier)`
  - `.load({ contentUrl? })` → `Promise<string>` (GAM VAST ad-tag URL)
  - `.getNextAdTagUrl()` → `Promise<string | null>`
  - `.reportImpression({ revenueUsd? })` → `Promise<void>`
  - `.destroy()` → `Promise<void>`

## License

SEE LICENSE IN LICENSE — Copyright (c) 2026 Ezoic Inc. All rights reserved.
