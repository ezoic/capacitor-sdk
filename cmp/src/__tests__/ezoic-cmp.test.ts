import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { EzoicCmp as EzoicCmpApi } from '../index';

const { plugin } = await vi.hoisted(async () => {
  const { createMockPlugin } = await import('./mock-plugin');
  return { plugin: createMockPlugin() };
});

vi.mock('../plugin', () => ({ EzoicCmpNative: plugin }));

// A fresh module per test: `initialize` memoizes per page (module instance).
let EzoicCmp: typeof EzoicCmpApi;

beforeEach(async () => {
  plugin.reset();
  vi.resetModules();
  ({ EzoicCmp } = await import('../index'));
});

describe('EzoicCmp.initialize', () => {
  it('forwards a normalized config', async () => {
    await EzoicCmp.initialize({
      domain: 'example.com',
      cmpEnabled: false,
      autoReadConsent: true,
      debugEnabled: true,
      autoPresentConsent: false,
    });
    expect(plugin.initialize).toHaveBeenCalledWith({
      domain: 'example.com',
      cmpEnabled: false,
      autoReadConsent: true,
      debugEnabled: true,
      autoPresentConsent: false,
    });
  });

  it('drops undefined and unknown fields', async () => {
    await EzoicCmp.initialize({ domain: 'example.com', debugEnabled: undefined, testMode: true } as never);
    expect(plugin.initialize).toHaveBeenCalledWith({ domain: 'example.com' });
  });

  it('throws on a missing domain without calling native', () => {
    expect(() => EzoicCmp.initialize({ domain: '' })).toThrow(/domain/);
    expect(plugin.initialize).not.toHaveBeenCalled();
  });

  it('shares one native init between concurrent and later calls', async () => {
    const first = EzoicCmp.initialize({ domain: 'example.com' });
    const second = EzoicCmp.initialize({ domain: 'other.com' });
    expect(second).toBe(first);
    await first;
    await EzoicCmp.initialize({ domain: 'example.com' });
    expect(plugin.initialize).toHaveBeenCalledTimes(1);
  });

  it('retries after a rejection', async () => {
    plugin.initialize.mockRejectedValueOnce(new Error('No Application context available.'));
    await expect(EzoicCmp.initialize({ domain: 'example.com' })).rejects.toThrow('No Application');
    await expect(EzoicCmp.initialize({ domain: 'example.com' })).resolves.toBeUndefined();
    expect(plugin.initialize).toHaveBeenCalledTimes(2);
  });

  it('calls native again on a new page (native ignores the repeat)', async () => {
    await EzoicCmp.initialize({ domain: 'example.com' });
    vi.resetModules();
    const { EzoicCmp: reloaded } = await import('../index');
    await expect(reloaded.initialize({ domain: 'example.com' })).resolves.toBeUndefined();
    expect(plugin.initialize).toHaveBeenCalledTimes(2);
  });
});

describe('consent', () => {
  it('parses simple and decided outcomes', async () => {
    plugin.presentConsentIfRequired.mockResolvedValue({ type: 'alreadyDecided' });
    await expect(EzoicCmp.presentConsentIfRequired()).resolves.toEqual({ type: 'alreadyDecided' });
    plugin.presentConsentSettings.mockResolvedValue({ type: 'decided', decision: 'rejectAll' });
    await expect(EzoicCmp.presentConsentSettings()).resolves.toEqual({ type: 'decided', decision: 'rejectAll' });
  });

  it('parses a refused-domain failure', async () => {
    plugin.presentConsentIfRequired.mockResolvedValue({ type: 'failed', code: 1001, message: 'not initialized' });
    await expect(EzoicCmp.presentConsentIfRequired()).resolves.toEqual({
      type: 'failed',
      code: 1001,
      message: 'not initialized',
    });
  });

  it('maps an unknown shape to failed(-1)', async () => {
    plugin.presentConsentSettings.mockResolvedValue({ type: 'nope' });
    await expect(EzoicCmp.presentConsentSettings()).resolves.toEqual({
      type: 'failed',
      code: -1,
      message: 'Unrecognized outcome',
    });
  });

  it('never rejects: a native rejection becomes failed(-1)', async () => {
    plugin.presentConsentIfRequired.mockRejectedValue(new Error('bridge gone'));
    await expect(EzoicCmp.presentConsentIfRequired()).resolves.toEqual({
      type: 'failed',
      code: -1,
      message: 'bridge gone',
    });
  });

  it('isConsentRequired and isPrivacyOptionsRequired unwrap booleans and nulls', async () => {
    plugin.isConsentRequired.mockResolvedValue({ required: true });
    await expect(EzoicCmp.isConsentRequired()).resolves.toBe(true);
    plugin.isConsentRequired.mockResolvedValue(undefined);
    await expect(EzoicCmp.isConsentRequired()).resolves.toBeNull();
    plugin.isPrivacyOptionsRequired.mockResolvedValue({ required: false });
    await expect(EzoicCmp.isPrivacyOptionsRequired()).resolves.toBe(false);
    plugin.isPrivacyOptionsRequired.mockResolvedValue({ required: null });
    await expect(EzoicCmp.isPrivacyOptionsRequired()).resolves.toBeNull();
  });

  it('resetConsent forwards', async () => {
    await EzoicCmp.resetConsent();
    expect(plugin.resetConsent).toHaveBeenCalled();
  });
});
