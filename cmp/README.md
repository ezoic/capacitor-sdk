# @ezoic/capacitor-cmp-sdk

Ezoic's built-in consent management platform for Capacitor apps of **Ezoic
publishers that don't use Ezoic ads**:

- In GDPR regions: the IAB TCF 2.4 consent dialog (CMP ID 299).
- In the US states with consumer privacy laws: a privacy notice and a "Do Not
  Sell My Information" choice, written as IAB GPP.

It writes the standard `IABTCF_*` / `IABGPP_*` keys that other SDKs read. It
is the same CMP that `@ezoic/capacitor-sdk` runs through `EzoicAds`, driven by
the same Ezoic publisher settings.

> **Use one package, not both.** `@ezoic/capacitor-sdk` already includes this
> CMP: apps that show Ezoic ads use `EzoicAds`'s consent methods and don't need
> this package. If an app installs both, `EzoicAds` takes the CMP over, both
> packages reach the same CMP and the same stored decision, and each native
> framework is linked once. Keep both packages at the same version: the iOS pod
> of `@ezoic/capacitor-sdk` pins this package exactly, so a mismatch fails
> `pod install`.

The CMP works only for domains registered with Ezoic. For any other domain it
stays off: every present resolves `failed` with code `1001`, the requirement
checks stay `null` and nothing is written.

## Requirements

- Capacitor 7 or 8.
- iOS 15.0+ and Xcode 26.2+, Android `minSdk` 24+ and Kotlin 2.2+.

## Installation

```sh
npm install @ezoic/capacitor-cmp-sdk
npx cap sync
```

- **iOS, Swift Package Manager:** `npx cap sync` adds the plugin's
  `Package.swift`, which pulls in the `EzoicCmpSDK` product of
  [ezoic-swift-sdk-dist](https://github.com/ezoic/ezoic-swift-sdk-dist).
- **iOS, CocoaPods:** the pod vendors the `EzoicCmpSDKBinary` XCFramework,
  which ships in the npm package. It needs no other pods.
- **Android:** the plugin depends on `com.ezoic.sdk:ezoic-cmp-sdk` from Maven
  Central. The Capacitor template's `google()` and `mavenCentral()`
  repositories are enough.

## Usage

```ts
import { EzoicCmp } from '@ezoic/capacitor-cmp-sdk';

await EzoicCmp.initialize({ domain: 'example.com' });
```

`initialize` resolves at once. The publisher settings load in the background,
and then the plugin presents the consent dialog if this user must decide
(`autoPresentConsent: true`). Call `initialize` on every launch; repeat calls,
for example after a WebView reload, are harmless.

| Field | Default | |
|---|---|---|
| `domain` | (required) | Your Ezoic domain. |
| `cmpEnabled` | `true` | Run the CMP. `false` turns it off. |
| `autoReadConsent` | `true` | `false` means the app manages consent itself: the CMP never presents or writes keys. |
| `debugEnabled` | `false` | Verbose native logging (logcat tag `EzoicCmp`; iOS subsystem `com.ezoic.cmp.sdk`). |
| `autoPresentConsent` | `true` | Present the consent dialog (if required) right after `initialize`. |

To control the timing or read the outcome, set `autoPresentConsent: false` and
call `presentConsentIfRequired()` yourself:

```ts
await EzoicCmp.initialize({ domain: 'example.com', autoPresentConsent: false });

const outcome = await EzoicCmp.presentConsentIfRequired();
if (outcome.type === 'failed') {
  console.log('Consent UI failed', outcome.code, outcome.message);
}
```

The promises always resolve, never reject, with an `EzoicConsentOutcome`.

| `type` | When |
|---|---|
| `notRequired` | GDPR doesn't apply, the CMP is off, another CMP owns consent, or `autoReadConsent: false`. In a covered US state `presentConsentIfRequired` always returns this, because the CMP shows its US notice by itself. |
| `alreadyDecided` | A still-valid decision is stored; no dialog shown. |
| `decided` | The user chose `decision` (`acceptAll`, `rejectAll` or `custom`). In the US settings, `acceptAll` means not opted out and `rejectAll` means opted out. |
| `dismissed` | The dialog closed without a choice. |
| `alreadyPresenting` | A consent dialog is already on screen or being prepared. |
| `failed` | The dialog couldn't be shown. Codes: `1001` not initialized or refused domain, `2001` network, `4001` render, `5002` invalid consent. `-1` with `'No foreground Activity'` means the plugin had no screen to present from. |

### Privacy choices entry point

Give users a "Privacy choices" button that calls `presentConsentSettings()`.
`isPrivacyOptionsRequired()` is `true` in a GDPR region or a covered US state
while the CMP handles consent. You may hide the button when it resolves
`false`, but don't hide it on `null`, which means "not known yet":

```ts
privacyButton.hidden = (await EzoicCmp.isPrivacyOptionsRequired()) === false;
privacyButton.onclick = () => EzoicCmp.presentConsentSettings();
```

In a GDPR region it reopens the TCF dialog with the stored choices. In a
covered US state it opens the US "Do Not Sell" settings.

## API

- `EzoicCmp.initialize({ domain, cmpEnabled?, autoReadConsent?, debugEnabled?, autoPresentConsent? })` → `Promise<void>`
- `EzoicCmp.presentConsentIfRequired()` → `Promise<EzoicConsentOutcome>`
- `EzoicCmp.presentConsentSettings()` → `Promise<EzoicConsentOutcome>`
- `EzoicCmp.isConsentRequired()` → `Promise<boolean | null>`: `null` while unknown (before `initialize`, while loading, refused domain)
- `EzoicCmp.isPrivacyOptionsRequired()` → `Promise<boolean | null>`
- `EzoicCmp.resetConsent()` → `Promise<void>`: forgets the stored decision and the US choice; the dialog or the US notice shows again

On the web every call is a no-op: consent resolves `notRequired` and the
checks resolve `null`.

## License

SEE LICENSE IN LICENSE. Copyright (c) 2026 Ezoic Inc. All rights reserved.
