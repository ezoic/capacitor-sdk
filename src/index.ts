import { consentFailure, parseConsentOutcome } from './consent';
import type { EzoicConfig, EzoicConsentOutcome } from './definitions';
import { normalizeConfig } from './helpers';
import { EzoicAdsNative } from './plugin';

export type {
  EzoicAdError,
  EzoicAdFrame,
  EzoicAdPlacement,
  EzoicAdSize,
  EzoicAdViewListeners,
  EzoicAttachOptions,
  EzoicBannerAdOptions,
  EzoicConfig,
  EzoicConsentDecision,
  EzoicConsentOutcome,
  EzoicInstreamImpressionOptions,
  EzoicInstreamLoadOptions,
  EzoicInterstitialAdListeners,
  EzoicNativeAdListeners,
  EzoicNativeAdOptions,
  EzoicOutstreamAdOptions,
  EzoicReward,
  EzoicRewardedAdListeners,
  EzoicRewardedShowOptions,
  // Wire contract, exported for apps that need to type the raw plugin.
  EzoicAdsPlugin,
} from './definitions';
export { EzoicErrorCode } from './definitions';
export { getEzoicErrorCode } from './helpers';
export { EzoicBannerAd, EzoicNativeAd, EzoicOutstreamAd } from './ad-view';
export { EzoicRewardedAd } from './rewarded-ad';
export { EzoicInterstitialAd } from './interstitial-ad';
export { EzoicInstreamAd } from './instream-ad';
export { EzoicAdsNative } from './plugin';

function presentConsent(call: () => Promise<unknown>): Promise<EzoicConsentOutcome> {
  return call().then(parseConsentOutcome, (e: unknown) =>
    consentFailure(-1, e instanceof Error ? e.message : String(e)),
  );
}

/**
 * The Ezoic Ads entry point: initialization, privacy signals, pageviews and
 * the built-in consent dialog. Ad units are created with the `Ezoic*Ad`
 * classes exported alongside it.
 */
export const EzoicAds = {
  /**
   * Initializes the native SDK. Resolves once the ad stack is ready; rejects
   * with the native error (see `getEzoicErrorCode`) if the init request fails
   * or the app is blocked.
   */
  initialize(config: EzoicConfig): Promise<void> {
    return EzoicAdsNative.initialize(normalizeConfig(config));
  },
  /**
   * Sets GDPR applicability and the TCF consent string yourself. Mutually
   * exclusive with the built-in CMP: call it before `initialize` on every
   * launch (or set `cmpEnabled: false`).
   */
  setGDPRConsent(applies: boolean, consentString?: string): Promise<void> {
    return EzoicAdsNative.setGDPRConsent({ applies, consentString });
  },
  /** Sets the GPP string and applicable section ids (a comma-separated string, e.g. `'7'`). */
  setGPPConsent(gppString?: string, sectionIds?: string): Promise<void> {
    return EzoicAdsNative.setGPPConsent({ gppString, sectionIds });
  },
  /** Flags the user as subject to COPPA (or not). Can be changed at runtime. */
  setSubjectToCOPPA(value: boolean): Promise<void> {
    return EzoicAdsNative.setSubjectToCOPPA({ value });
  },
  /**
   * Records a pageview. Pass a `screen` label (e.g. `'Home'`,
   * `'members/profile'`) to name the screen in Ezoic reporting; without one
   * the pageview lands on a single app-wide bucket. Resolves `true` when the
   * pageview was recorded.
   */
  trackPageview(screen?: string): Promise<boolean> {
    return EzoicAdsNative.trackPageview({ screen }).then((r) => r?.tracked === true);
  },
  /**
   * Shows the built-in consent dialog if this user must decide (GDPR applies,
   * no valid stored decision). Runs automatically after `initialize` unless
   * `autoPresentConsent: false`; repeat calls are harmless. Always resolves.
   */
  presentConsentIfRequired(): Promise<EzoicConsentOutcome> {
    return presentConsent(() => EzoicAdsNative.presentConsentIfRequired());
  },
  /**
   * Re-opens the consent dialog with the user's stored choices. TCF requires
   * a persistent "Privacy settings" entry point that calls this. Always
   * resolves.
   */
  presentConsentSettings(): Promise<EzoicConsentOutcome> {
    return presentConsent(() => EzoicAdsNative.presentConsentSettings());
  },
  /**
   * `true` when GDPR applies and the built-in CMP handles consent, `false`
   * otherwise, `null` until the init request completes or when the server
   * sent no consent information.
   */
  isConsentRequired(): Promise<boolean | null> {
    return EzoicAdsNative.isConsentRequired().then((r) => (typeof r?.required === 'boolean' ? r.required : null));
  },
  /** Deletes the decision stored by the built-in CMP so the dialog shows again. */
  resetConsent(): Promise<void> {
    return EzoicAdsNative.resetConsent();
  },
};
