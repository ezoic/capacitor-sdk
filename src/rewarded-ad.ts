import type {
  EzoicFullScreenAdEvent,
  EzoicReward,
  EzoicRewardedAdListeners,
  EzoicRewardedShowOptions,
} from './definitions';
import { rewardedAdEvents } from './events';
import { coerceAdUnitId, mapRewardResult } from './helpers';
import { EzoicAdsNative } from './plugin';

/**
 * A rewarded ad. Use the static `load` to fetch an ad ahead of time, then call
 * `show()` to present it and grant the reward when the user finishes watching.
 *
 * ```ts
 * const ad = await EzoicRewardedAd.load('12345');
 * ad.setListeners({ onDismissed: () => console.log('closed') });
 * const reward = await ad.show();
 * if (reward) grantReward(reward.amount);
 * ```
 *
 * Mirrors the native `EzoicRewardedAd` load/show lifecycle on both platforms.
 * Rewarded ads are single-use — load a new one for the next opportunity.
 */
export class EzoicRewardedAd {
  /** The Ezoic ad unit identifier this ad was loaded for. */
  readonly adUnitIdentifier: string;

  private listeners: EzoicRewardedAdListeners = {};
  private subscribed = false;
  private spent = false;
  private destroyed = false;

  private constructor(adUnitIdentifier: string) {
    this.adUnitIdentifier = adUnitIdentifier;
    rewardedAdEvents.subscribe(adUnitIdentifier, (event) => this.handleEvent(event));
    this.subscribed = true;
  }

  /**
   * Loads a rewarded ad for the given Ezoic ad unit identifier. Resolves with
   * a ready-to-show `EzoicRewardedAd`, or rejects if no ad could be loaded
   * (use `getEzoicErrorCode(error)` for the native code).
   */
  static async load(adUnitIdentifier: string | number): Promise<EzoicRewardedAd> {
    const id = coerceAdUnitId(adUnitIdentifier);
    const ad = new EzoicRewardedAd(id);
    try {
      await EzoicAdsNative.loadRewardedAd({ adUnitIdentifier: id });
      return ad;
    } catch (error) {
      ad.release();
      throw error;
    }
  }

  /** Registers lifecycle callbacks. Replaces any previously set listeners. */
  setListeners(listeners: EzoicRewardedAdListeners): void {
    this.listeners = listeners;
  }

  /**
   * Presents the rewarded ad full-screen. Resolves with the earned reward, or
   * `null` if the ad was dismissed before the reward was earned. Rejects if the
   * ad was not ready (load first) or failed to present. Pass `rewardName` so
   * rewarded reports can group by the reward you offer.
   */
  async show(options: EzoicRewardedShowOptions = {}): Promise<EzoicReward | null> {
    const result = await EzoicAdsNative.showRewardedAd({
      adUnitIdentifier: this.adUnitIdentifier,
      rewardName: options.rewardName,
    });
    return mapRewardResult(result);
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
      await EzoicAdsNative.destroyRewardedAd({ adUnitIdentifier: this.adUnitIdentifier }).catch(() => undefined);
    }
  }

  private release(): void {
    if (this.subscribed) {
      rewardedAdEvents.unsubscribe(this.adUnitIdentifier);
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
      case 'reward':
        this.listeners.onUserEarnedReward?.({
          type: event.rewardType ?? '',
          amount: event.rewardAmount ?? 0,
        });
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
