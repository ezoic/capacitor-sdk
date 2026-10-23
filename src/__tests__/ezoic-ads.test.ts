import { beforeEach, describe, expect, it, vi } from 'vitest';

import { EzoicErrorCode, getEzoicErrorCode } from '../index';
import type { EzoicAds as EzoicAdsApi } from '../index';

import { flush } from './mock-plugin';

const { plugin } = await vi.hoisted(async () => {
  const { createMockPlugin } = await import('./mock-plugin');
  return { plugin: createMockPlugin() };
});

vi.mock('../plugin', () => ({ EzoicAdsNative: plugin }));

// A fresh module per test: `initialize` memoizes per page (module instance).
let EzoicAds: typeof EzoicAdsApi;

beforeEach(async () => {
  plugin.reset();
  vi.resetModules();
  ({ EzoicAds } = await import('../index'));
});

const alreadyInitialized = () => Object.assign(new Error('already'), { code: '1002', data: { code: 1002 } });

describe('EzoicAds.initialize', () => {
  it('forwards a normalized config', async () => {
    await EzoicAds.initialize({ domain: 'example.com', testMode: true, cmpEnabled: false });
    expect(plugin.initialize).toHaveBeenCalledWith({ domain: 'example.com', testMode: true, cmpEnabled: false });
  });

  it('drops undefined optional fields', async () => {
    await EzoicAds.initialize({ domain: 'example.com', debugEnabled: undefined });
    expect(plugin.initialize).toHaveBeenCalledWith({ domain: 'example.com' });
  });

  it('rejects synchronously-detected missing domain', async () => {
    await expect(() => EzoicAds.initialize({ domain: '' })).toThrow(/domain/);
    expect(plugin.initialize).not.toHaveBeenCalled();
  });

  it('propagates native rejections', async () => {
    const error = Object.assign(new Error('blocked'), { code: '1004', data: { code: 1004 } });
    plugin.initialize.mockRejectedValue(error);
    await expect(EzoicAds.initialize({ domain: 'example.com' })).rejects.toBe(error);
    expect(getEzoicErrorCode(error)).toBe(1004);
  });

  it('treats AlreadyInitialized (1002, after a WebView reload) as success and presents consent', async () => {
    plugin.initialize.mockRejectedValue(alreadyInitialized());
    await expect(EzoicAds.initialize({ domain: 'example.com' })).resolves.toBeUndefined();
    await flush();
    expect(plugin.presentConsentIfRequired).toHaveBeenCalledTimes(1);
  });

  it('skips the consent dialog after 1002 when autoPresentConsent is false', async () => {
    plugin.initialize.mockRejectedValue(alreadyInitialized());
    await expect(EzoicAds.initialize({ domain: 'example.com', autoPresentConsent: false })).resolves.toBeUndefined();
    await flush();
    expect(plugin.presentConsentIfRequired).not.toHaveBeenCalled();
  });

  it('ignores a failing consent dialog after 1002', async () => {
    plugin.initialize.mockRejectedValue(alreadyInitialized());
    plugin.presentConsentIfRequired.mockRejectedValue(new Error('No foreground Activity'));
    await expect(EzoicAds.initialize({ domain: 'example.com' })).resolves.toBeUndefined();
    await flush();
  });

  it('shares one native init between concurrent and later calls', async () => {
    let finish: () => void = () => undefined;
    plugin.initialize.mockReturnValue(new Promise<void>((r) => (finish = r)));
    const first = EzoicAds.initialize({ domain: 'example.com' });
    const second = EzoicAds.initialize({ domain: 'example.com' });
    expect(second).toBe(first);
    finish();
    await expect(Promise.all([first, second])).resolves.toEqual([undefined, undefined]);
    await EzoicAds.initialize({ domain: 'example.com' });
    expect(plugin.initialize).toHaveBeenCalledTimes(1);
  });

  it('retries the native init after a rejection', async () => {
    plugin.initialize.mockRejectedValueOnce(new Error('network'));
    await expect(EzoicAds.initialize({ domain: 'example.com' })).rejects.toThrow('network');
    await expect(EzoicAds.initialize({ domain: 'example.com' })).resolves.toBeUndefined();
    expect(plugin.initialize).toHaveBeenCalledTimes(2);
  });
});

describe('privacy setters', () => {
  it('setGDPRConsent', async () => {
    await EzoicAds.setGDPRConsent(true, 'tcf');
    expect(plugin.setGDPRConsent).toHaveBeenCalledWith({ applies: true, consentString: 'tcf' });
  });

  it('setGPPConsent', async () => {
    await EzoicAds.setGPPConsent('gpp', '7');
    expect(plugin.setGPPConsent).toHaveBeenCalledWith({ gppString: 'gpp', sectionIds: '7' });
  });

  it('setSubjectToCOPPA', async () => {
    await EzoicAds.setSubjectToCOPPA(true);
    expect(plugin.setSubjectToCOPPA).toHaveBeenCalledWith({ value: true });
  });
});

describe('EzoicAds.trackPageview', () => {
  it('passes the screen label and unwraps the result', async () => {
    await expect(EzoicAds.trackPageview('Home')).resolves.toBe(true);
    expect(plugin.trackPageview).toHaveBeenCalledWith({ screen: 'Home' });
  });

  it('passes undefined when no label is given', async () => {
    plugin.trackPageview.mockResolvedValue({ tracked: false });
    await expect(EzoicAds.trackPageview()).resolves.toBe(false);
    expect(plugin.trackPageview).toHaveBeenCalledWith({ screen: undefined });
  });

  it('treats a malformed result as not tracked', async () => {
    plugin.trackPageview.mockResolvedValue(undefined);
    await expect(EzoicAds.trackPageview()).resolves.toBe(false);
  });
});

describe('consent', () => {
  it('parses simple outcomes', async () => {
    plugin.presentConsentIfRequired.mockResolvedValue({ type: 'alreadyDecided' });
    await expect(EzoicAds.presentConsentIfRequired()).resolves.toEqual({ type: 'alreadyDecided' });
  });

  it('parses decided outcomes', async () => {
    plugin.presentConsentSettings.mockResolvedValue({ type: 'decided', decision: 'rejectAll' });
    await expect(EzoicAds.presentConsentSettings()).resolves.toEqual({ type: 'decided', decision: 'rejectAll' });
  });

  it('parses failed outcomes and defaults the message', async () => {
    plugin.presentConsentIfRequired.mockResolvedValue({ type: 'failed', code: 1001 });
    await expect(EzoicAds.presentConsentIfRequired()).resolves.toEqual({
      type: 'failed',
      code: 1001,
      message: 'Unknown error',
    });
  });

  it('maps an unknown shape to failed(-1)', async () => {
    plugin.presentConsentIfRequired.mockResolvedValue({ type: 'decided', decision: 'maybe' });
    await expect(EzoicAds.presentConsentIfRequired()).resolves.toEqual({
      type: 'failed',
      code: -1,
      message: 'Unrecognized outcome',
    });
  });

  it('never rejects: a native rejection becomes failed(-1)', async () => {
    plugin.presentConsentSettings.mockRejectedValue(new Error('No foreground Activity'));
    await expect(EzoicAds.presentConsentSettings()).resolves.toEqual({
      type: 'failed',
      code: -1,
      message: 'No foreground Activity',
    });
  });

  it('isConsentRequired unwraps booleans and nulls', async () => {
    plugin.isConsentRequired.mockResolvedValue({ required: true });
    await expect(EzoicAds.isConsentRequired()).resolves.toBe(true);
    plugin.isConsentRequired.mockResolvedValue({ required: null });
    await expect(EzoicAds.isConsentRequired()).resolves.toBeNull();
    plugin.isConsentRequired.mockResolvedValue(undefined);
    await expect(EzoicAds.isConsentRequired()).resolves.toBeNull();
  });

  it('resetConsent forwards', async () => {
    await EzoicAds.resetConsent();
    expect(plugin.resetConsent).toHaveBeenCalled();
  });
});

describe('getEzoicErrorCode', () => {
  it('reads data.code first, then a numeric string code', () => {
    expect(getEzoicErrorCode({ code: '5001', data: { code: 5001 } })).toBe(EzoicErrorCode.consentRequired);
    expect(getEzoicErrorCode({ code: '5001' })).toBe(5001);
    expect(getEzoicErrorCode({ code: 'UNAVAILABLE' })).toBeUndefined();
    expect(getEzoicErrorCode(new Error('x'))).toBeUndefined();
    expect(getEzoicErrorCode(null)).toBeUndefined();
  });
});
