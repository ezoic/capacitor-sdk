import type { EzoicFullScreenAdEvent, EzoicInterstitialAdListeners } from './definitions';
import { interstitialAdEvents } from './events';
import { coerceAdUnitId } from './helpers';
import { EzoicAdsNative } from './plugin';

/**
 * An interstitial ad. Use the static `load` to fetch an ad ahead of time, then
 * call `show()` to present it full-screen at a natural transition point.
 * Interstitials carry no reward.
 *
 * ```ts
 * const ad = await EzoicInterstitialAd.load('12345');
 * ad.setListeners({ onDismissed: () => console.log('closed') });
 * await ad.show();
 * ```
 *
 * Mirrors the native `EzoicInterstitialAd` load/show lifecycle on both
 * platforms. Interstitial ads are single-use — load a new one for the next
 * opportunity.
 */
export class EzoicInterstitialAd {
  /** The Ezoic ad unit identifier this ad was loaded for. */
  readonly adUnitIdentifier: string;

  private listeners: EzoicInterstitialAdListeners = {};
  private subscribed = false;
  private spent = false;
  private destroyed = false;

  private constructor(adUnitIdentifier: string) {
    this.adUnitIdentifier = adUnitIdentifier;
    interstitialAdEvents.subscribe(adUnitIdentifier, (event) => this.handleEvent(event));
    this.subscribed = true;
  }

  /**
   * Loads an interstitial ad for the given Ezoic ad unit identifier. Resolves
   * with a ready-to-show `EzoicInterstitialAd`, or rejects if no ad could be
   * loaded (use `getEzoicErrorCode(error)` for the native code).
   */
  static async load(adUnitIdentifier: string | number): Promise<EzoicInterstitialAd> {
    const id = coerceAdUnitId(adUnitIdentifier);
    const ad = new EzoicInterstitialAd(id);
    try {
      await EzoicAdsNative.loadInterstitialAd({ adUnitIdentifier: id });
      return ad;
    } catch (error) {
      ad.release();
      throw error;
    }
  }

  /** Registers lifecycle callbacks. Replaces any previously set listeners. */
  setListeners(listeners: EzoicInterstitialAdListeners): void {
    this.listeners = listeners;
  }

  /**
   * Presents the interstitial ad full-screen. Resolves when the ad is
   * dismissed. Rejects if the ad was not ready (load first) or failed to
   * present.
   */
  async show(): Promise<void> {
    await EzoicAdsNative.showInterstitialAd({ adUnitIdentifier: this.adUnitIdentifier });
  }

  /**
   * Releases the ad: drops the listeners and, if the ad was loaded but never
   * shown, discards the native ad so a new one can be loaded for this unit.
   * Safe to call multiple times.
   */
  async destroy(): Promise<void> {
    if (this.destroyed) return;
    this.destroyed = true;
    const wasSpent = this.spent;
    this.release();
    if (!wasSpent) {
      await EzoicAdsNative.destroyInterstitialAd({ adUnitIdentifier: this.adUnitIdentifier }).catch(() => undefined);
    }
  }

  private release(): void {
    if (this.subscribed) {
      interstitialAdEvents.unsubscribe(this.adUnitIdentifier);
      this.subscribed = false;
    }
    this.listeners = {};
  }

  private handleEvent(event: EzoicFullScreenAdEvent): void {
    switch (event.type) {
      case 'shown':
        this.listeners.onShown?.();
        break;
      case 'failedToShow':
        this.listeners.onFailedToShow?.({
          message: event.message ?? 'Unknown error',
          code: typeof event.code === 'number' ? event.code : 0,
        });
        // Failure to show is terminal — the native ad is single-use.
        this.spent = true;
        this.release();
        break;
      case 'impression':
        this.listeners.onImpression?.();
        break;
      case 'clicked':
        this.listeners.onClicked?.();
        break;
      case 'dismissed':
        this.listeners.onDismissed?.();
        // Dismissal is terminal — the native ad is single-use.
        this.spent = true;
        this.release();
        break;
    }
  }
}
