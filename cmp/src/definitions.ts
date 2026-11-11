// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Options for `EzoicCmp.initialize`. Same fields and defaults as the native `EzoicCmpConfiguration`. */
export interface EzoicCmpConfig {
  /** Your Ezoic domain, as registered in the Ezoic dashboard. Required. */
  domain: string;
  /**
   * Run the built-in CMP: the TCF dialog in GDPR regions, and the notice and
   * "Do Not Sell" choice in covered US states. Default `true`.
   */
  cmpEnabled?: boolean;
  /**
   * `false` means the app manages consent itself: the CMP then never presents,
   * and never writes `IABTCF_*` / `IABGPP_*` keys. Default `true`.
   */
  autoReadConsent?: boolean;
  /** Verbose native logging. Default `false`. */
  debugEnabled?: boolean;
  /** Present the consent dialog (if required) right after `initialize`. Default `true`. */
  autoPresentConsent?: boolean;
}

/** Which button the user closed the consent dialog with. */
export type EzoicConsentDecision = 'acceptAll' | 'rejectAll' | 'custom';

/**
 * Result of `EzoicCmp.presentConsentIfRequired` / `presentConsentSettings`.
 * The same shape as `EzoicConsentOutcome` in `@ezoic/capacitor-sdk`.
 *
 * - `notRequired`: GDPR doesn't apply (always, in a covered US state, for
 *   `presentConsentIfRequired`), the CMP is off, another CMP owns consent, or
 *   `autoReadConsent: false`.
 * - `alreadyDecided`: a still-valid decision is stored; no dialog was shown.
 * - `decided`: the user made a choice, which has been saved. From the US
 *   privacy settings, `acceptAll` means not opted out and `rejectAll` means
 *   opted out of the sale or sharing of personal information.
 * - `dismissed`: the dialog closed without a choice.
 * - `alreadyPresenting`: a consent dialog is already on screen or being
 *   prepared.
 * - `failed`: the dialog could not be shown. `code` is the native `CmpError`
 *   code (1001 not initialized or refused domain, 2001 network, 4001 render,
 *   5002 invalid consent), or `-1` (`'No foreground Activity'`) when the
 *   plugin had no foreground Activity / view controller.
 */
export type EzoicConsentOutcome =
  | { type: 'notRequired' }
  | { type: 'alreadyDecided' }
  | { type: 'dismissed' }
  | { type: 'alreadyPresenting' }
  | { type: 'decided'; decision: EzoicConsentDecision }
  | { type: 'failed'; code: number; message: string };

// ---------------------------------------------------------------------------
// Native plugin wire format (internal; use the `EzoicCmp` facade)
// ---------------------------------------------------------------------------

/** @internal Wire format of a consent outcome from the native plugin. */
export interface EzoicConsentOutcomeRaw {
  type: string;
  decision?: string;
  code?: number;
  message?: string;
}

/**
 * @internal The raw Capacitor plugin. Prefer the `EzoicCmp` facade; this
 * interface is the wire contract with the native code and may change between
 * minor versions.
 */
export interface EzoicCmpPlugin {
  initialize(options: EzoicCmpConfig): Promise<void>;
  presentConsentIfRequired(): Promise<EzoicConsentOutcomeRaw>;
  presentConsentSettings(): Promise<EzoicConsentOutcomeRaw>;
  isConsentRequired(): Promise<{ required: boolean | null }>;
  isPrivacyOptionsRequired(): Promise<{ required: boolean | null }>;
  resetConsent(): Promise<void>;
}
