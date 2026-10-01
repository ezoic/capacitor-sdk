import type { PluginListenerHandle } from '@capacitor/core';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Options for `EzoicAds.initialize`. Same fields and defaults as the native SDKs. */
export interface EzoicConfig {
  /** Your Ezoic domain, as registered in the Ezoic dashboard. Required. */
  domain: string;
  /** Read `IABTCF_*` / `IABGPP_*` consent keys written by a CMP. Default `true`. */
  autoReadConsent?: boolean;
  /** Treat the user as subject to COPPA. Default `false`. */
  subjectToCOPPA?: boolean;
  /** iOS only: request App Tracking Transparency before the first ad. Default `true`. */
  requestATTBeforeAds?: boolean;
  /** Verbose native logging. Default `false`. */
  debugEnabled?: boolean;
  /** Ezoic $0.00 test ads. Disable before release. Default `false`. */
  testMode?: boolean;
  /** Record a pageview automatically on native screen changes. Default `true`. */
  autoTrackPageviews?: boolean;
  /** Enable the built-in TCF CMP for GDPR regions. Default `true`; set `false` if you run your own CMP. */
  cmpEnabled?: boolean;
  /** Present the consent dialog (if required) right after `initialize` succeeds. Default `true`. */
  autoPresentConsent?: boolean;
}

/** Which button the user closed the consent dialog with. */
export type EzoicConsentDecision = 'acceptAll' | 'rejectAll' | 'custom';

/**
 * Result of `EzoicAds.presentConsentIfRequired` / `presentConsentSettings`.
 *
 * - `notRequired`: GDPR doesn't apply, the built-in CMP is disabled, another
 *   CMP owns consent, or consent is managed by the app (`setGDPRConsent`, or
 *   `autoReadConsent: false`).
 * - `alreadyDecided`: a still-valid decision is stored; no dialog was shown.
 * - `decided`: the user made a choice, which has been saved.
 * - `dismissed`: the dialog closed without a choice; ads stay gated for this
 *   session.
 * - `alreadyPresenting`: a consent dialog is already on screen or being
 *   prepared.
 * - `failed`: the dialog could not be shown. `code` is the native
 *   `EzoicError` code, or `-1` (`'No foreground Activity'`) when the plugin
 *   had no foreground Activity / view controller: native was not called, ads
 *   stay gated, and you should call again once a screen is showing.
 */
export type EzoicConsentOutcome =
  | { type: 'notRequired' }
  | { type: 'alreadyDecided' }
  | { type: 'dismissed' }
  | { type: 'alreadyPresenting' }
  | { type: 'decided'; decision: EzoicConsentDecision }
  | { type: 'failed'; code: number; message: string };

/** An error reported by an ad view or a full-screen ad. */
export interface EzoicAdError {
  message: string;
  /** Native `EzoicError` code (see `EzoicErrorCode`), or `0`/`-1` for plugin-side errors. */
  code: number;
}

/**
 * Displayed ad size in CSS pixels (dp on Android, points on iOS).
 * `{ width: 0, height: 0 }` means the native view collapsed after a terminal no-fill.
 */
export interface EzoicAdSize {
  width: number;
  height: number;
}

/** A rectangle in CSS pixels relative to the WebView's visible viewport. */
export interface EzoicAdFrame {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Where a native ad view is overlaid on the WebView.
 *
 * Capacitor renders your UI in a WebView, so the native ad views cannot live
 * inside the DOM. They are overlaid on top of the WebView instead:
 *
 * - `top` / `bottom`: anchored to that screen edge (inside the safe area),
 *   centred horizontally, `margin` CSS px away from the edge. `width`/`height`
 *   size the view; a banner defaults to the creative size, an outstream or
 *   native ad to full width × 250 / 300.
 * - `inline`: placed at `frame`, a rectangle in CSS px relative to the
 *   viewport. Use `attachTo(element)` on the ad to keep the frame in sync with
 *   a DOM placeholder (scroll, resize, layout changes).
 */
export type EzoicAdPlacement =
  | {
      position: 'top' | 'bottom';
      /** Distance from the edge in CSS px. Default `0`. */
      margin?: number;
      /** Fixed width in CSS px. Default: full width (outstream/native) or the creative width (banner). */
      width?: number;
      /** Fixed height in CSS px. Default: 250 (outstream), 300 (native), or the creative height (banner). */
      height?: number;
    }
  | {
      position: 'inline';
      frame: EzoicAdFrame;
    };

/** Lifecycle callbacks for a banner / outstream ad view. All are optional. */
export interface EzoicAdViewListeners {
  onLoad?: () => void;
  onError?: (error: EzoicAdError) => void;
  onImpression?: () => void;
  onClick?: () => void;
  onOpen?: () => void;
  onClose?: () => void;
  /** Displayed ad size changed: the creative size after a load, or 0x0 on collapse. */
  onSizeChange?: (size: EzoicAdSize) => void;
}

/** Lifecycle callbacks for a native ad. All are optional. */
export interface EzoicNativeAdListeners {
  onLoad?: () => void;
  onError?: (error: EzoicAdError) => void;
  onImpression?: () => void;
  onClick?: () => void;
  onOpen?: () => void;
  onClose?: () => void;
}

/** Options for `EzoicBannerAd.create`. */
export interface EzoicBannerAdOptions {
  /** The Ezoic ad unit identifier (numeric; a string is coerced). */
  adUnitIdentifier: string | number;
  /** `"WxH"` or a comma-separated list, e.g. `"300x250"`, `"300x250,320x50"`. Default: adaptive. */
  size?: string;
  /** Collapse the view (height 0) when a load fails and no ad is displayed. Default `true`. */
  collapseOnNoFill?: boolean;
  /** Where to overlay the view. Default `{ position: 'bottom' }`. */
  placement?: EzoicAdPlacement;
}

/** Options for `EzoicOutstreamAd.create`. */
export interface EzoicOutstreamAdOptions {
  adUnitIdentifier: string | number;
  /** Collapse the view (height 0) when a load fails and no ad is displayed. Default `true`. */
  collapseOnNoFill?: boolean;
  /** Where to overlay the view. Default `{ position: 'bottom' }`. */
  placement?: EzoicAdPlacement;
}

/** Options for `EzoicNativeAd.create`. */
export interface EzoicNativeAdOptions {
  adUnitIdentifier: string | number;
  /** Where to overlay the view. Default `{ position: 'bottom' }`. */
  placement?: EzoicAdPlacement;
}

/** Options for `attachTo`. */
export interface EzoicAttachOptions {
  /**
   * Set the placeholder element's `height` from the native `onSizeChange`
   * event (the creative height, or `0` when collapsed). Default `true`.
   */
  autoHeight?: boolean;
}

/** A reward earned by the user for completing a rewarded ad. */
export interface EzoicReward {
  type: string;
  amount: number;
}

/** Lifecycle callbacks for a rewarded ad. All are optional. */
export interface EzoicRewardedAdListeners {
  onShown?: () => void;
  onFailedToShow?: (error: EzoicAdError) => void;
  onImpression?: () => void;
  onClicked?: () => void;
  onDismissed?: () => void;
  onUserEarnedReward?: (reward: EzoicReward) => void;
}

/** Lifecycle callbacks for an interstitial ad. All are optional. */
export interface EzoicInterstitialAdListeners {
  onShown?: () => void;
  onFailedToShow?: (error: EzoicAdError) => void;
  onImpression?: () => void;
  onClicked?: () => void;
  onDismissed?: () => void;
}

/** Options for `EzoicRewardedAd.show`. */
export interface EzoicRewardedShowOptions {
  /** The name of the reward you offer, so rewarded reports can group by it. */
  rewardName?: string;
}

/** Options for `EzoicInstreamAd.load`. */
export interface EzoicInstreamLoadOptions {
  /**
   * The URL of the video the host is currently playing. When supplied it is
   * added to the VAST ad tag as `url`/`description_url` for contextual
   * targeting. Omit it when the content URL is unknown.
   */
  contentUrl?: string;
}

/** Options for `EzoicInstreamAd.reportImpression`. */
export interface EzoicInstreamImpressionOptions {
  /**
   * The publisher-reported revenue (USD) for this impression, if known. Folded
   * into the Ezoic impression-event pixel. Omit it when no revenue is known.
   */
  revenueUsd?: number;
}

/**
 * Numeric native error codes. Read them with `getEzoicErrorCode(error)` from a
 * rejected promise, or from `error.code` on an ad view's `onError`.
 */
export const EzoicErrorCode = {
  /**
   * GDPR applies and the user hasn't decided: the ad load waited for the
   * consent dialog and timed out. Call `EzoicAds.presentConsentIfRequired()`.
   */
  consentRequired: 5001,
} as const;

// ---------------------------------------------------------------------------
// Native plugin wire format (internal; use the classes exported from index.ts)
// ---------------------------------------------------------------------------

/** @internal Wire format of a consent outcome from the native plugin. */
export interface EzoicConsentOutcomeRaw {
  type: string;
  decision?: string;
  code?: number;
  message?: string;
}

/** @internal Result of `showRewardedAd`. */
export interface EzoicRewardResult {
  earned: boolean;
  type: string;
  amount: number;
}

/** @internal */
export type EzoicAdViewKind = 'banner' | 'native' | 'outstream';

/** @internal */
export interface EzoicAdViewEvent {
  id: string;
  type: 'loaded' | 'failed' | 'impression' | 'clicked' | 'opened' | 'closed' | 'sizeChanged';
  message?: string;
  code?: number;
  width?: number;
  height?: number;
}

/** @internal */
export interface EzoicFullScreenAdEvent {
  adUnitIdentifier: string;
  type: 'shown' | 'failedToShow' | 'impression' | 'clicked' | 'dismissed' | 'reward';
  message?: string;
  code?: number;
  rewardType?: string;
  rewardAmount?: number;
}

/**
 * @internal The raw Capacitor plugin. Prefer the `EzoicAds` facade and the ad
 * classes exported from the package root; this interface is the wire contract
 * with the native code and may change between minor versions.
 */
export interface EzoicAdsPlugin {
  initialize(options: EzoicConfig): Promise<void>;
  setGDPRConsent(options: { applies: boolean; consentString?: string }): Promise<void>;
  setGPPConsent(options: { gppString?: string; sectionIds?: string }): Promise<void>;
  setSubjectToCOPPA(options: { value: boolean }): Promise<void>;
  trackPageview(options: { screen?: string }): Promise<{ tracked: boolean }>;
  presentConsentIfRequired(): Promise<EzoicConsentOutcomeRaw>;
  presentConsentSettings(): Promise<EzoicConsentOutcomeRaw>;
  isConsentRequired(): Promise<{ required: boolean | null }>;
  resetConsent(): Promise<void>;

  createAdView(options: {
    id: string;
    kind: EzoicAdViewKind;
    adUnitIdentifier: string;
    size?: string;
    collapseOnNoFill?: boolean;
    placement: EzoicAdPlacement;
  }): Promise<void>;
  loadAdView(options: { id: string }): Promise<void>;
  showAdView(options: { id: string }): Promise<void>;
  hideAdView(options: { id: string }): Promise<void>;
  setAdViewPlacement(options: { id: string; placement: EzoicAdPlacement }): Promise<void>;
  destroyAdView(options: { id: string }): Promise<void>;

  loadRewardedAd(options: { adUnitIdentifier: string }): Promise<void>;
  showRewardedAd(options: { adUnitIdentifier: string; rewardName?: string }): Promise<EzoicRewardResult>;
  destroyRewardedAd(options: { adUnitIdentifier: string }): Promise<void>;
  loadInterstitialAd(options: { adUnitIdentifier: string }): Promise<void>;
  showInterstitialAd(options: { adUnitIdentifier: string }): Promise<void>;
  destroyInterstitialAd(options: { adUnitIdentifier: string }): Promise<void>;

  loadInstreamAd(options: { adUnitIdentifier: number; contentUrl?: string }): Promise<{ adTagUrl: string }>;
  getInstreamNextAdTagUrl(options: { adUnitIdentifier: number }): Promise<{ adTagUrl: string | null }>;
  reportInstreamImpression(options: { adUnitIdentifier: number; revenueUsd?: number }): Promise<void>;
  destroyInstreamAd(options: { adUnitIdentifier: number }): Promise<void>;

  addListener(eventName: 'adViewEvent', listener: (event: EzoicAdViewEvent) => void): Promise<PluginListenerHandle>;
  addListener(
    eventName: 'rewardedAdEvent' | 'interstitialAdEvent',
    listener: (event: EzoicFullScreenAdEvent) => void,
  ): Promise<PluginListenerHandle>;
}
