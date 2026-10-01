import type { PluginListenerHandle } from '@capacitor/core';

import type { EzoicAdViewEvent, EzoicFullScreenAdEvent } from './definitions';
import { EzoicAdsNative } from './plugin';

type EventName = 'adViewEvent' | 'rewardedAdEvent' | 'interstitialAdEvent';

interface EventMap {
  adViewEvent: EzoicAdViewEvent;
  rewardedAdEvent: EzoicFullScreenAdEvent;
  interstitialAdEvent: EzoicFullScreenAdEvent;
}

type Handler<K extends EventName> = (event: EventMap[K]) => void;

/**
 * One native listener per event name, shared by every ad instance. Instances
 * register a handler keyed by their id and events are routed to the matching
 * handlers, so the native side never has to track JS subscriptions.
 *
 * Several handlers may share a key: full-screen ads are keyed by ad unit, and
 * a second `load` for a unit must neither replace nor (when it is rejected
 * and cleans up) drop the subscription of the instance already alive.
 */
class EventHub<K extends EventName> {
  private handlers = new Map<string, Set<Handler<K>>>();
  private handle: Promise<PluginListenerHandle> | null = null;

  constructor(
    private readonly eventName: K,
    private readonly keyOf: (event: EventMap[K]) => string,
  ) {}

  /** Routes events for `key` to `handler` (in addition to any other handler for that key). */
  subscribe(key: string, handler: Handler<K>): void {
    let set = this.handlers.get(key);
    if (!set) {
      set = new Set();
      this.handlers.set(key, set);
    }
    set.add(handler);
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

  /** Removes `handler` for `key`; other handlers registered under the same key are kept. */
  unsubscribe(key: string, handler: Handler<K>): void {
    const set = this.handlers.get(key);
    if (!set) return;
    set.delete(handler);
    if (set.size === 0) this.handlers.delete(key);
  }

  private dispatch(event: EventMap[K]): void {
    if (!event || typeof event !== 'object') return;
    const set = this.handlers.get(this.keyOf(event));
    if (!set) return;
    // Copy: a handler may unsubscribe (e.g. on `dismissed`) while dispatching.
    for (const handler of [...set]) handler(event);
  }
}

export const adViewEvents = new EventHub('adViewEvent', (e) => String(e.id));
export const rewardedAdEvents = new EventHub('rewardedAdEvent', (e) => String(e.adUnitIdentifier));
export const interstitialAdEvents = new EventHub('interstitialAdEvent', (e) => String(e.adUnitIdentifier));
