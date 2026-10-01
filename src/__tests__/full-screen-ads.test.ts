import { beforeEach, describe, expect, it, vi } from 'vitest';

import { EzoicInstreamAd, EzoicInterstitialAd, EzoicRewardedAd } from '../index';

import { flush } from './mock-plugin';

const { plugin } = await vi.hoisted(async () => {
  const { createMockPlugin } = await import('./mock-plugin');
  return { plugin: createMockPlugin() };
});

vi.mock('../plugin', () => ({ EzoicAdsNative: plugin }));

beforeEach(() => {
  plugin.reset();
});

describe('EzoicRewardedAd', () => {
  it('load resolves an instance and forwards the string id', async () => {
    const ad = await EzoicRewardedAd.load(12345);
    expect(ad.adUnitIdentifier).toBe('12345');
    expect(plugin.loadRewardedAd).toHaveBeenCalledWith({ adUnitIdentifier: '12345' });
  });

  it('load rejects and unsubscribes on failure', async () => {
    plugin.loadRewardedAd.mockRejectedValue(new Error('No fill'));
    await expect(EzoicRewardedAd.load('1')).rejects.toThrow('No fill');
  });

  it('show maps an earned reward and an unearned dismissal', async () => {
    const ad = await EzoicRewardedAd.load('1');
    plugin.showRewardedAd.mockResolvedValue({ earned: true, type: 'coins', amount: 10 });
    await expect(ad.show({ rewardName: 'extra-life' })).resolves.toEqual({ type: 'coins', amount: 10 });
    expect(plugin.showRewardedAd).toHaveBeenCalledWith({ adUnitIdentifier: '1', rewardName: 'extra-life' });

    plugin.showRewardedAd.mockResolvedValue({ earned: false, type: '', amount: 0 });
    await expect(ad.show()).resolves.toBeNull();
  });

  it('dispatches lifecycle events to the matching instance', async () => {
    const a = await EzoicRewardedAd.load('1');
    const b = await EzoicRewardedAd.load('2');
    await flush();
    const aListeners = { onShown: vi.fn(), onUserEarnedReward: vi.fn(), onDismissed: vi.fn() };
    const bListeners = { onShown: vi.fn() };
    a.setListeners(aListeners);
    b.setListeners(bListeners);

    plugin.emit('rewardedAdEvent', { adUnitIdentifier: '1', type: 'shown' });
    plugin.emit('rewardedAdEvent', { adUnitIdentifier: '1', type: 'reward', rewardType: 'coins', rewardAmount: 5 });
    plugin.emit('rewardedAdEvent', { adUnitIdentifier: '1', type: 'dismissed' });

    expect(aListeners.onShown).toHaveBeenCalledTimes(1);
    expect(aListeners.onUserEarnedReward).toHaveBeenCalledWith({ type: 'coins', amount: 5 });
    expect(aListeners.onDismissed).toHaveBeenCalledTimes(1);
    expect(bListeners.onShown).not.toHaveBeenCalled();
  });

  it('dismissal is terminal: no further events, destroy skips the native call', async () => {
    const ad = await EzoicRewardedAd.load('1');
    await flush();
    const onDismissed = vi.fn();
    const onImpression = vi.fn();
    ad.setListeners({ onDismissed, onImpression });
    plugin.emit('rewardedAdEvent', { adUnitIdentifier: '1', type: 'dismissed' });
    plugin.emit('rewardedAdEvent', { adUnitIdentifier: '1', type: 'impression' });
    expect(onDismissed).toHaveBeenCalledTimes(1);
    expect(onImpression).not.toHaveBeenCalled();
    await ad.destroy();
    expect(plugin.destroyRewardedAd).not.toHaveBeenCalled();
  });

  it('failedToShow is terminal and carries the error', async () => {
    const ad = await EzoicRewardedAd.load('1');
    await flush();
    const onFailedToShow = vi.fn();
    ad.setListeners({ onFailedToShow });
    plugin.emit('rewardedAdEvent', { adUnitIdentifier: '1', type: 'failedToShow', message: 'not ready', code: 1010 });
    expect(onFailedToShow).toHaveBeenCalledWith({ message: 'not ready', code: 1010 });
  });

  it('destroy of an unshown ad releases the native ad', async () => {
    const ad = await EzoicRewardedAd.load('1');
    await ad.destroy();
    expect(plugin.destroyRewardedAd).toHaveBeenCalledWith({ adUnitIdentifier: '1' });
    // Idempotent, and a native rejection is swallowed.
    plugin.destroyRewardedAd.mockRejectedValue(new Error('gone'));
    await expect(ad.destroy()).resolves.toBeUndefined();
  });
});

describe('EzoicInterstitialAd', () => {
  it('load and show forward the id; show resolves on dismissal', async () => {
    const ad = await EzoicInterstitialAd.load('3');
    await expect(ad.show()).resolves.toBeUndefined();
    expect(plugin.loadInterstitialAd).toHaveBeenCalledWith({ adUnitIdentifier: '3' });
    expect(plugin.showInterstitialAd).toHaveBeenCalledWith({ adUnitIdentifier: '3' });
  });

  it('load rejects on failure', async () => {
    plugin.loadInterstitialAd.mockRejectedValue(new Error('No fill'));
    await expect(EzoicInterstitialAd.load('3')).rejects.toThrow('No fill');
  });

  it('dispatches every event type', async () => {
    const ad = await EzoicInterstitialAd.load('3');
    await flush();
    const listeners = {
      onShown: vi.fn(),
      onFailedToShow: vi.fn(),
      onImpression: vi.fn(),
      onClicked: vi.fn(),
      onDismissed: vi.fn(),
    };
    ad.setListeners(listeners);
    plugin.emit('interstitialAdEvent', { adUnitIdentifier: '3', type: 'shown' });
    plugin.emit('interstitialAdEvent', { adUnitIdentifier: '3', type: 'impression' });
    plugin.emit('interstitialAdEvent', { adUnitIdentifier: '3', type: 'clicked' });
    plugin.emit('interstitialAdEvent', { adUnitIdentifier: '3', type: 'dismissed' });
    expect(listeners.onShown).toHaveBeenCalledTimes(1);
    expect(listeners.onImpression).toHaveBeenCalledTimes(1);
    expect(listeners.onClicked).toHaveBeenCalledTimes(1);
    expect(listeners.onDismissed).toHaveBeenCalledTimes(1);
    expect(listeners.onFailedToShow).not.toHaveBeenCalled();
  });

  it('destroy of an unshown ad releases the native ad once', async () => {
    const ad = await EzoicInterstitialAd.load('3');
    await ad.destroy();
    await ad.destroy();
    expect(plugin.destroyInterstitialAd).toHaveBeenCalledTimes(1);
  });
});

describe('EzoicInstreamAd', () => {
  it('coerces the id to a number', () => {
    expect(new EzoicInstreamAd('42').adUnitIdentifier).toBe(42);
    expect(new EzoicInstreamAd(42).adUnitIdentifier).toBe(42);
    expect(Number.isNaN(new EzoicInstreamAd('abc').adUnitIdentifier)).toBe(true);
  });

  it('load unwraps the tag URL and passes contentUrl', async () => {
    const ad = new EzoicInstreamAd(42);
    await expect(ad.load({ contentUrl: 'https://v' })).resolves.toBe('https://tag');
    expect(plugin.loadInstreamAd).toHaveBeenCalledWith({ adUnitIdentifier: 42, contentUrl: 'https://v' });
    await ad.load();
    expect(plugin.loadInstreamAd).toHaveBeenLastCalledWith({ adUnitIdentifier: 42, contentUrl: undefined });
  });

  it('getNextAdTagUrl maps a missing tag to null', async () => {
    const ad = new EzoicInstreamAd(42);
    await expect(ad.getNextAdTagUrl()).resolves.toBeNull();
    plugin.getInstreamNextAdTagUrl.mockResolvedValue({ adTagUrl: 'https://next' });
    await expect(ad.getNextAdTagUrl()).resolves.toBe('https://next');
  });

  it('reportImpression and destroy forward', async () => {
    const ad = new EzoicInstreamAd(42);
    await ad.reportImpression({ revenueUsd: 0.42 });
    await ad.destroy();
    expect(plugin.reportInstreamImpression).toHaveBeenCalledWith({ adUnitIdentifier: 42, revenueUsd: 0.42 });
    expect(plugin.destroyInstreamAd).toHaveBeenCalledWith({ adUnitIdentifier: 42 });
  });
});
