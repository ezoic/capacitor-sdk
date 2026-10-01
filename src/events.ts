import type { PluginListenerHandle } from '@capacitor/core';

import type { EzoicAdViewEvent, EzoicFullScreenAdEvent } from './definitions';
import { EzoicAdsNative } from './plugin';

type EventName = 'adViewEvent' | 'rewardedAdEvent' | 'interstitialAdEvent';

interface EventMap {
  adViewEvent: EzoicAdViewEvent;
  rewardedAdEvent: EzoicFullScreenAdEvent;
  interstitialAdEvent: EzoicFullScreenAdEvent;
}

/**
 * One native listener per event name, shared by every ad instance. Instances
 * register a handler keyed by their id and events are routed to the matching
 * handler, so the native side never has to track JS subscriptions.
 */
class EventHub<K extends EventName> {
  private handlers = new Map<string, (event: EventMap[K]) => void>();
  private handle: Promise<PluginListenerHandle> | null = null;

  constructor(
    private readonly eventName: K,
    private readonly keyOf: (event: EventMap[K]) => string,
  ) {}

  /** Routes events for `key` to `handler`; replaces any previous handler for that key. */
  subscribe(key: string, handler: (event: EventMap[K]) => void): void {
    this.handlers.set(key, handler);
    if (!this.handle) {
      // addListener is typed per event name; the cast collapses the overloads.
      this.handle = (
        EzoicAdsNative.addListener as (name: K, listener: (event: EventMap[K]) => void) => Promise<PluginListenerHandle>
      )(this.eventName, (event) => this.dispatch(event));
      // A rejected addListener (e.g. a web runtime without the plugin) should
      // not surface as an unhandled rejection; events simply never arrive.
      this.handle.catch(() => undefined);
    }
  }

  unsubscribe(key: string): void {
    this.handlers.delete(key);
  }

  private dispatch(event: EventMap[K]): void {
    if (!event || typeof event !== 'object') return;
    const handler = this.handlers.get(this.keyOf(event));
    handler?.(event);
  }
}

export const adViewEvents = new EventHub('adViewEvent', (e) => String(e.id));
export const rewardedAdEvents = new EventHub('rewardedAdEvent', (e) => String(e.adUnitIdentifier));
export const interstitialAdEvents = new EventHub('interstitialAdEvent', (e) => String(e.adUnitIdentifier));
