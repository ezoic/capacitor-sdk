import { EzoicAdsNative } from './plugin';

function randomPrefix(): string {
  const crypto = globalThis.crypto;
  if (crypto?.getRandomValues) {
    const words = crypto.getRandomValues(new Uint32Array(2));
    return Array.from(words, (w) => w.toString(36)).join('');
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/**
 * Random per-page prefix for ad view ids. Native ad views outlive the page
 * (reload, live update, navigation), so ids from a new page must never match
 * ids left over from the previous one.
 */
export const SESSION_PREFIX = randomPrefix();

/**
 * Settles once native has destroyed every ad view, full-screen ad and
 * instream controller left over from a previous page. Native ad creation
 * awaits it so a new ad is never torn down by the reset. Never rejects: a
 * failed reset must not block ads.
 */
export const sessionReady: Promise<void> = new Promise<void>((resolve) => resolve(EzoicAdsNative.resetSession())).then(
  () => undefined,
  () => undefined,
);
