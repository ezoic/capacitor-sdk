import { WebPlugin } from '@capacitor/core';

import type { EzoicCmpConfig, EzoicCmpPlugin, EzoicConsentOutcomeRaw } from './definitions';

/**
 * Web implementation. The CMP is native-only, so every method is a harmless
 * no-op: consent reports `notRequired` and the requirement checks `null`. On
 * the web, use Ezoic's web CMP instead.
 */
export class EzoicCmpWeb extends WebPlugin implements EzoicCmpPlugin {
  private warned = false;

  private warnOnce(): void {
    if (this.warned) return;
    this.warned = true;
    console.warn('[EzoicCmp] The Ezoic CMP is only available on iOS and Android. Calls are no-ops on the web.');
  }

  async initialize(_options: EzoicCmpConfig): Promise<void> {
    this.warnOnce();
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

  async isPrivacyOptionsRequired(): Promise<{ required: boolean | null }> {
    this.warnOnce();
    return { required: null };
  }

  async resetConsent(): Promise<void> {
    this.warnOnce();
  }
}
