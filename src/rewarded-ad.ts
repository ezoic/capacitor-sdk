import type {
  EzoicFullScreenAdEvent,
  EzoicReward,
  EzoicRewardedAdListeners,
  EzoicRewardedShowOptions,
} from './definitions';
import { rewardedAdEvents } from './events';
import { coerceAdUnitId, mapRewardResult, REWARDED_DEFAULT_AD_UNIT_ID } from './helpers';
import { EzoicAdsNative } from './plugin';
import { sessionReady } from './session';

/**
 * A rewarded ad. Use the static `load` to fetch an ad ahead of time, then call
 * `show()` to present it and grant the reward when the user finishes watching.
 *
 * ```ts
 * const ad = await EzoicRewardedAd.load();
 * ad.setListeners({ onDismissed: () => console.log('closed') });
 * const reward = await ad.show();
 * if (reward) grantReward(reward.amount);
 * ```
 *
 * Mirrors the native `EzoicRewardedAd` load/show lifecycle on both platforms.
 * Rewarded ads are single-use — load a new one for the next opportunity.
 */
export class EzoicRewardedAd {
  /**
   * The ad unit identifier passed to `load`, or `'0'` when it was loaded
   * without one. Rewarded ads don't need one; it only tells loaded ads apart.
   */
  readonly adUnitIdentifier: string;

  private listeners: EzoicRewardedAdListeners = {};
  private subscribed = false;
  private readonly onEvent = (event: EzoicFullScreenAdEvent) => this.handleEvent(event);
  private spent = false;
  private destroyed = false;

  private constructor(adUnitIdentifier: string) {
    this.adUnitIdentifier = adUnitIdentifier;
    rewardedAdEvents.subscribe(adUnitIdentifier, this.onEvent);
    this.subscribed = true;
  }

  /**
   * Loads a rewarded ad. Resolves with a ready-to-show `EzoicRewardedAd`, or
   * rejects if no ad could be loaded (use `getEzoicErrorCode(error)` for the
   * native code).
   *
   * Rewarded ads need no ad unit identifier (since 1.25.0). An identifier
   * passed as before still works but has no effect on the ad; it only keys
   * this ad, so different identifiers let you hold more than one loaded
   * rewarded ad at a time. Without one, one rewarded ad can be loaded at a
   * time: show or destroy it before loading the next.
   */
  static async load(adUnitIdentifier?: string | number): Promise<EzoicRewardedAd> {
    const id =
      adUnitIdentifier === undefined || adUnitIdentifier === null || adUnitIdentifier === ''
        ? REWARDED_DEFAULT_AD_UNIT_ID
        : coerceAdUnitId(adUnitIdentifier);
    const ad = new EzoicRewardedAd(id);
    try {
      await sessionReady;
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
      rewardedAdEvents.unsubscribe(this.adUnitIdentifier, this.onEvent);
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
