# Changelog

All notable changes to `@ezoic/capacitor-cmp-sdk` are documented here. The
plugin version tracks the native Ezoic CMP SDKs it wraps (Swift and Kotlin),
and `@ezoic/capacitor-sdk`, in lockstep.

## 1.22.0 (unreleased)

First release. Wraps the standalone Ezoic CMP 1.22.0 (`EzoicCmp`): Android
`com.ezoic.sdk:ezoic-cmp-sdk`, iOS `EzoicCmpSDK` (Swift Package Manager) or the
vendored `EzoicCmpSDKBinary` XCFramework (CocoaPods).

- `EzoicCmp.initialize`, `presentConsentIfRequired`, `presentConsentSettings`,
  `isConsentRequired`, `isPrivacyOptionsRequired` and `resetConsent`, with the
  same outcomes as the consent methods of `@ezoic/capacitor-sdk`.
- The TCF 2.4 dialog in GDPR regions, and the US-state notice and "Do Not
  Sell" settings in covered US states.
- For Ezoic publishers only: a domain that isn't an Ezoic publisher's leaves
  the CMP off (`failed` with code 1001).
