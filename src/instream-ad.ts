import type { EzoicInstreamImpressionOptions, EzoicInstreamLoadOptions } from './definitions';
import { EzoicAdsNative } from './plugin';

/**
 * An instream video ad controller. Instream video runs inside the host app's
 * OWN video content: **the host owns the video player and the Google IMA SDK**
 * (for a Capacitor app, typically the IMA HTML5 SDK in the WebView). Unlike the
 * banner/native/outstream views this controller renders nothing and holds no
 * view — its sole deliverable is a GAM VAST ad-tag URL string the host feeds to
 * its own IMA `AdsRequest`.
 *
 * ```ts
 * const instream = new EzoicInstreamAd('12345');
 * const tagUrl = await instream.load({ contentUrl: playingVideoUrl });
 * // hand tagUrl to your IMA AdsLoader / AdsRequest.
 *
 * // On an IMA ad error, walk down the floor waterfall:
 * const next = await instream.getNextAdTagUrl();
 * if (next) { /* request IMA again with next *\/ }
 *
 * // On the IMA STARTED event, record the Ezoic impression:
 * await instream.reportImpression({ revenueUsd: 0.42 });
 *
 * // When finished with the ad unit:
 * await instream.destroy();
 * ```
 *
 * Mirrors the native `EzoicInstreamAd` load pipeline on both platforms. Unlike
 * the interstitial/rewarded ads, the controller is **multi-use** and NOT
 * auto-destroying: the native controller is prefetchable and reused across
 * loads for the same id. Call `destroy` when the unit is no longer needed.
 */
export class EzoicInstreamAd {
  /** The Ezoic ad unit identifier this controller was created for. */
  readonly adUnitIdentifier: number;

  /**
   * @param adUnitIdentifier the Ezoic ad unit id (numeric). A string is coerced
   * to a number so callers can pass either; a non-numeric string yields `NaN`,
   * which the native side rejects.
   */
  constructor(adUnitIdentifier: string | number) {
    this.adUnitIdentifier = Number(adUnitIdentifier);
  }

  /**
   * Loads the instream config, runs optional Prebid demand, and resolves with
   * the GAM VAST ad-tag URL for the host's IMA player. Rejects on no fill, an
   * uninitialized SDK, or an overlapping load already in flight for this id.
   * Safe to call again after a previous load resolves (multi-use).
   */
  async load(options: EzoicInstreamLoadOptions = {}): Promise<string> {
    const { adTagUrl } = await EzoicAdsNative.loadInstreamAd({
      adUnitIdentifier: this.adUnitIdentifier,
      contentUrl: options.contentUrl,
    });
    return adTagUrl;
  }

  /**
   * Pops the current head off the floor waterfall and resolves with the ad tag
   * rebuilt against the next `eb_br` hash, or `null` once the waterfall is
   * exhausted (or before a successful `load` / after `destroy`). Call this on
   * an IMA ad error to try the next floor.
   */
  async getNextAdTagUrl(): Promise<string | null> {
    const { adTagUrl } = await EzoicAdsNative.getInstreamNextAdTagUrl({
      adUnitIdentifier: this.adUnitIdentifier,
    });
    return adTagUrl ?? null;
  }

  /**
   * Fires the Ezoic impression-event pixel for the most recently delivered tag.
   * Call this on the IMA `STARTED` event. No-op natively when no tag has been
   * delivered or after `destroy`.
   */
  reportImpression(options: EzoicInstreamImpressionOptions = {}): Promise<void> {
    return EzoicAdsNative.reportInstreamImpression({
      adUnitIdentifier: this.adUnitIdentifier,
      revenueUsd: options.revenueUsd,
    });
  }

  /**
   * Cancels any in-flight load and releases the native controller for this id.
   * A load in flight rejects. Safe to call multiple times.
   */
  destroy(): Promise<void> {
    return EzoicAdsNative.destroyInstreamAd({ adUnitIdentifier: this.adUnitIdentifier });
  }
}
