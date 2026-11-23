# Changelog

All notable changes to `@ezoic/capacitor-cmp-sdk` are documented here. The
plugin version tracks the native Ezoic CMP SDKs it wraps (Swift and Kotlin),
and `@ezoic/capacitor-sdk`, in lockstep.

## 1.26.0

Wraps the standalone Ezoic CMP 1.26.0 on Android and iOS. No changes to the
CMP's API or behaviour; the version follows `@ezoic/capacitor-sdk`, which
skipped 1.25.0 (native 1.25.0 and 1.26.0 changed only ads code).

## 1.24.0

Wraps the standalone Ezoic CMP 1.24.0 on Android and iOS (one version for
every Ezoic SDK from now on). No changes to the CMP's API or behaviour; the
version follows `@ezoic/capacitor-sdk`.

- The consent types (`ConsentOutcome` and friends) moved into a new native
  consent-core library that the CMP depends on: Android
  `com.ezoic.sdk:ezoic-consent-core` comes in transitively; the iOS pod now
  vendors `EzoicConsentCoreBinary` next to `EzoicCmpSDKBinary`. Nothing to
  change in your app.

## 1.22.3

Wraps the standalone Ezoic CMP, Android 1.22.3 and iOS 1.23.2. No changes to
the CMP; the version follows `@ezoic/capacitor-sdk`.

## 1.22.2

First release. Wraps the standalone Ezoic CMP (`EzoicCmp`), Android 1.22.2 and
iOS 1.23.1: Android `com.ezoic.sdk:ezoic-cmp-sdk`, iOS `EzoicCmpSDK` (Swift Package Manager) or the
vendored `EzoicCmpSDKBinary` XCFramework (CocoaPods).

- `EzoicCmp.initialize`, `presentConsentIfRequired`, `presentConsentSettings`,
  `isConsentRequired`, `isPrivacyOptionsRequired` and `resetConsent`, with the
  same outcomes as the consent methods of `@ezoic/capacitor-sdk`.
- The TCF 2.4 dialog in GDPR regions, and the US-state notice and "Do Not
  Sell" settings in covered US states.
- For Ezoic publishers only: a domain that isn't an Ezoic publisher's leaves
  the CMP off (`failed` with code 1001).
