import { WebPlugin } from '@capacitor/core';

import type {
  EzoicAdPlacement,
  EzoicAdViewKind,
  EzoicAdsPlugin,
  EzoicConfig,
  EzoicConsentOutcomeRaw,
  EzoicRewardResult,
} from './definitions';

const NOT_AVAILABLE = 'Ezoic ads are only available on iOS and Android.';

/**
 * Web implementation. The Ezoic mobile ad stack is native-only, so every
 * method here is a harmless no-op: `initialize` resolves, consent reports
 * `notRequired`, ad views report a `failed` event, and full-screen / instream
 * loads reject with `unavailable`. For a web deployment of the same app use
 * Ezoic's web integration (EzoicAds standalone) instead.
 */
export class EzoicAdsWeb extends WebPlugin implements EzoicAdsPlugin {
  private warned = false;

  private warnOnce(): void {
    if (this.warned) return;
    this.warned = true;
    console.warn(`[EzoicAds] ${NOT_AVAILABLE} Calls are no-ops on the web.`);
  }

  async initialize(_options: EzoicConfig): Promise<void> {
    this.warnOnce();
  }

  async setGDPRConsent(_options: { applies: boolean; consentString?: string }): Promise<void> {
    this.warnOnce();
  }

  async setGPPConsent(_options: { gppString?: string; sectionIds?: string }): Promise<void> {
    this.warnOnce();
  }

  async setSubjectToCOPPA(_options: { value: boolean }): Promise<void> {
    this.warnOnce();
  }

  async trackPageview(_options: { screen?: string }): Promise<{ tracked: boolean }> {
    this.warnOnce();
    return { tracked: false };
  }

  async presentConsentIfRequired(): Promise<EzoicConsentOutcomeRaw> {
    this.warnOnce();
    return { type: 'notRequired' };
  }

  async presentConsentSettings(): Promise<EzoicConsentOutcomeRaw> {
    this.warnOnce();
    return { type: 'notRequired' };
  }

  async isConsentRequired(): Promise<{ required: boolean | null }> {
    this.warnOnce();
    return { required: null };
  }

  async resetConsent(): Promise<void> {
    this.warnOnce();
  }

  async createAdView(_options: {
    id: string;
    kind: EzoicAdViewKind;
    adUnitIdentifier: string;
    size?: string;
    collapseOnNoFill?: boolean;
    placement: EzoicAdPlacement;
  }): Promise<void> {
    this.warnOnce();
  }

  async loadAdView(options: { id: string }): Promise<void> {
    this.warnOnce();
    // Mirror a native no-fill so host code written against the events works.
    this.notifyListeners('adViewEvent', { id: options.id, type: 'failed', message: NOT_AVAILABLE, code: -1 });
    this.notifyListeners('adViewEvent', { id: options.id, type: 'sizeChanged', width: 0, height: 0 });
  }

  async showAdView(_options: { id: string }): Promise<void> {
    this.warnOnce();
  }

  async hideAdView(_options: { id: string }): Promise<void> {
    this.warnOnce();
  }

  async setAdViewPlacement(_options: { id: string; placement: EzoicAdPlacement }): Promise<void> {
    this.warnOnce();
  }

  async destroyAdView(_options: { id: string }): Promise<void> {
    this.warnOnce();
  }

  async loadRewardedAd(_options: { adUnitIdentifier: string }): Promise<void> {
    throw this.unavailable(NOT_AVAILABLE);
  }

  async showRewardedAd(_options: { adUnitIdentifier: string; rewardName?: string }): Promise<EzoicRewardResult> {
    throw this.unavailable(NOT_AVAILABLE);
  }

  async destroyRewardedAd(_options: { adUnitIdentifier: string }): Promise<void> {
    this.warnOnce();
  }

  async loadInterstitialAd(_options: { adUnitIdentifier: string }): Promise<void> {
    throw this.unavailable(NOT_AVAILABLE);
  }

  async showInterstitialAd(_options: { adUnitIdentifier: string }): Promise<void> {
    throw this.unavailable(NOT_AVAILABLE);
  }

  async destroyInterstitialAd(_options: { adUnitIdentifier: string }): Promise<void> {
    this.warnOnce();
  }

  async loadInstreamAd(_options: { adUnitIdentifier: number; contentUrl?: string }): Promise<{ adTagUrl: string }> {
    throw this.unavailable(NOT_AVAILABLE);
  }

  async getInstreamNextAdTagUrl(_options: { adUnitIdentifier: number }): Promise<{ adTagUrl: string | null }> {
    this.warnOnce();
    return { adTagUrl: null };
  }

  async reportInstreamImpression(_options: { adUnitIdentifier: number; revenueUsd?: number }): Promise<void> {
    this.warnOnce();
  }

  async destroyInstreamAd(_options: { adUnitIdentifier: number }): Promise<void> {
    this.warnOnce();
  }
}
