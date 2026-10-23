import { beforeEach, describe, expect, it, vi } from 'vitest';

import { flush } from './mock-plugin';

const { plugin } = await vi.hoisted(async () => {
  const { createMockPlugin } = await import('./mock-plugin');
  return { plugin: createMockPlugin() };
});

vi.mock('../plugin', () => ({ EzoicAdsNative: plugin }));

/** Imports the package as a fresh page load would, with `resetSession` settling only when `finish` is called. */
async function loadPage(outcome: 'resolve' | 'reject' = 'resolve') {
  let finish: () => void = () => undefined;
  plugin.resetSession.mockReturnValue(
    new Promise<void>((resolve, reject) => {
      finish = () => (outcome === 'resolve' ? resolve() : reject(new Error('not implemented')));
    }),
  );
  vi.resetModules();
  const sdk = await import('../index');
  return { sdk, finish };
}

beforeEach(() => {
  plugin.reset();
});

describe('page session reset', () => {
  it('resets native once when the package loads', async () => {
    const { sdk, finish } = await loadPage();
    finish();
    await sdk.EzoicBannerAd.create({ adUnitIdentifier: '1' });
    await sdk.EzoicBannerAd.create({ adUnitIdentifier: '2' });
    expect(plugin.resetSession).toHaveBeenCalledTimes(1);
    expect(plugin.resetSession).toHaveBeenCalledWith();
  });

  it('holds ad creation and full-screen / instream loads until the reset settles', async () => {
    const { sdk, finish } = await loadPage();
    const banner = sdk.EzoicBannerAd.create({ adUnitIdentifier: '1' });
    const native = sdk.EzoicNativeAd.create({ adUnitIdentifier: '2' });
    const outstream = sdk.EzoicOutstreamAd.create({ adUnitIdentifier: '3' });
    const rewarded = sdk.EzoicRewardedAd.load('4');
    const interstitial = sdk.EzoicInterstitialAd.load('5');
    const instream = new sdk.EzoicInstreamAd(6).load();
    await flush();
    expect(plugin.createAdView).not.toHaveBeenCalled();
    expect(plugin.loadRewardedAd).not.toHaveBeenCalled();
    expect(plugin.loadInterstitialAd).not.toHaveBeenCalled();
    expect(plugin.loadInstreamAd).not.toHaveBeenCalled();

    finish();
    await Promise.all([banner, native, outstream, rewarded, interstitial, instream]);
    expect(plugin.createAdView).toHaveBeenCalledTimes(3);
    expect(plugin.loadRewardedAd).toHaveBeenCalledTimes(1);
    expect(plugin.loadInterstitialAd).toHaveBeenCalledTimes(1);
    expect(plugin.loadInstreamAd).toHaveBeenCalledTimes(1);
    const resetOrder = plugin.resetSession.mock.invocationCallOrder[0] ?? Infinity;
    expect(Math.min(...plugin.createAdView.mock.invocationCallOrder)).toBeGreaterThan(resetOrder);
  });

  it('still creates ads when the reset rejects', async () => {
    const { sdk, finish } = await loadPage('reject');
    const banner = sdk.EzoicBannerAd.create({ adUnitIdentifier: '1' });
    finish();
    await expect(banner).resolves.toBeInstanceOf(sdk.EzoicBannerAd);
    expect(plugin.createAdView).toHaveBeenCalledTimes(1);
  });

  it('consumes and drops events replayed from the previous page until the reset settles', async () => {
    const before = plugin.listenerCount('rewardedAdEvent');
    const { finish } = await loadPage();
    // Listening at load consumes Capacitor's replay of retained events.
    expect(plugin.listenerCount('rewardedAdEvent')).toBe(before + 1);
    expect(plugin.listenerCount('interstitialAdEvent')).toBeGreaterThan(0);
    expect(plugin.listenerCount('adViewEvent')).toBeGreaterThan(0);

    const { rewardedAdEvents } = await import('../events');
    const handler = vi.fn();
    rewardedAdEvents.subscribe('4', handler);
    plugin.emit('rewardedAdEvent', { adUnitIdentifier: '4', type: 'dismissed' });
    expect(handler).not.toHaveBeenCalled();

    finish();
    await flush();
    plugin.emit('rewardedAdEvent', { adUnitIdentifier: '4', type: 'shown' });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ adUnitIdentifier: '4', type: 'shown' });
  });

  it('prefixes ad view ids per page so a reloaded page never reuses a live native id', async () => {
    const first = await loadPage();
    first.finish();
    const a = await first.sdk.EzoicBannerAd.create({ adUnitIdentifier: '1' });

    const second = await loadPage();
    second.finish();
    const b = await second.sdk.EzoicBannerAd.create({ adUnitIdentifier: '1' });

    expect(a.id).toMatch(/^ezoic-[a-z0-9]+-banner-1$/);
    expect(b.id).toMatch(/^ezoic-[a-z0-9]+-banner-1$/);
    expect(a.id).not.toBe(b.id);
  });
});
