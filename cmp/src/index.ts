import { consentFailure, parseConsentOutcome } from './consent';
import type { EzoicCmpConfig, EzoicConsentOutcome } from './definitions';
import { EzoicCmpNative } from './plugin';

export type {
  EzoicCmpConfig,
  EzoicConsentDecision,
  EzoicConsentOutcome,
  // Wire contract, exported for apps that need to type the raw plugin.
  EzoicCmpPlugin,
} from './definitions';
export { EzoicCmpNative } from './plugin';

function normalizeConfig(config: EzoicCmpConfig): EzoicCmpConfig {
  if (!config?.domain) {
    throw new Error('EzoicCmp.initialize requires a non-empty `domain`.');
  }
  const out: EzoicCmpConfig = { domain: config.domain };
  if (config.cmpEnabled !== undefined) out.cmpEnabled = config.cmpEnabled;
  if (config.autoReadConsent !== undefined) out.autoReadConsent = config.autoReadConsent;
  if (config.debugEnabled !== undefined) out.debugEnabled = config.debugEnabled;
  if (config.autoPresentConsent !== undefined) out.autoPresentConsent = config.autoPresentConsent;
  return out;
}

let initialization: Promise<void> | null = null;

function presentConsent(call: () => Promise<unknown>): Promise<EzoicConsentOutcome> {
  return call().then(parseConsentOutcome, (e: unknown) =>
    consentFailure(-1, e instanceof Error ? e.message : String(e)),
  );
}

/**
 * Ezoic's built-in consent management platform (the TCF dialog in GDPR
 * regions, the notice and "Do Not Sell" choice in covered US states) for
 * Ezoic publishers whose app doesn't use Ezoic ads. Apps that use
 * `@ezoic/capacitor-sdk` call the same methods on `EzoicAds` instead: use one
 * package, not both.
 */
export const EzoicCmp = {
  /**
   * Starts the CMP for your Ezoic domain. Resolves at once: the publisher
   * settings load in the background, and `presentConsentIfRequired` waits for
   * them. A domain that isn't an Ezoic publisher's leaves the CMP off: every
   * present resolves `failed` with code 1001 and nothing is written.
   *
   * Safe to call on every page load: native ignores repeat calls. Calls
   * within one page share a single native call (the first `config` wins).
   */
  initialize(config: EzoicCmpConfig): Promise<void> {
    const options = normalizeConfig(config);
    if (!initialization) {
      initialization = EzoicCmpNative.initialize(options).catch((error: unknown) => {
        initialization = null;
        throw error;
      });
    }
    return initialization;
  },
  /**
   * Shows the consent dialog if this user must decide (GDPR applies, no valid
   * stored decision). Runs automatically after `initialize` unless
   * `autoPresentConsent: false`; repeat calls are harmless. In covered US
   * states it resolves `notRequired`: the CMP shows its US notice by itself.
   * Always resolves.
   */
  presentConsentIfRequired(): Promise<EzoicConsentOutcome> {
    return presentConsent(() => EzoicCmpNative.presentConsentIfRequired());
  },
  /**
   * The "Privacy settings" entry point. In a GDPR region it re-opens the TCF
   * dialog with the user's stored choices. In a covered US state it opens the
   * US privacy settings: `decided` with `acceptAll` (not opted out) or
   * `rejectAll` (opted out), or `dismissed`. `notRequired` elsewhere. Always
   * resolves.
   */
  presentConsentSettings(): Promise<EzoicConsentOutcome> {
    return presentConsent(() => EzoicCmpNative.presentConsentSettings());
  },
  /**
   * `true` when GDPR applies and the CMP handles consent, `false` otherwise,
   * `null` while unknown (before `initialize`, while the settings load, or
   * when they couldn't be loaded, e.g. a refused domain).
   */
  isConsentRequired(): Promise<boolean | null> {
    return EzoicCmpNative.isConsentRequired().then((r) => (typeof r?.required === 'boolean' ? r.required : null));
  },
  /**
   * `true` when the app should show a "Privacy choices" entry point that calls
   * `presentConsentSettings`: in a GDPR region or a covered US state while the
   * CMP handles consent. `false` otherwise, `null` while unknown.
   */
  isPrivacyOptionsRequired(): Promise<boolean | null> {
    return EzoicCmpNative.isPrivacyOptionsRequired().then((r) =>
      typeof r?.required === 'boolean' ? r.required : null,
    );
  },
  /**
   * Deletes the stored decision and the consent keys this CMP wrote, so the
   * dialog shows again. The US-state choice is forgotten too; the US notice
   * shows again on the next launch.
   */
  resetConsent(): Promise<void> {
    return EzoicCmpNative.resetConsent();
  },
};
