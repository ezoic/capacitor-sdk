import { beforeEach, describe, expect, it, vi } from 'vitest';

import { EzoicBannerAd, EzoicNativeAd, EzoicOutstreamAd } from '../index';

import { flush } from './mock-plugin';

const { plugin } = await vi.hoisted(async () => {
  const { createMockPlugin } = await import('./mock-plugin');
  return { plugin: createMockPlugin() };
});

vi.mock('../plugin', () => ({ EzoicAdsNative: plugin }));

beforeEach(() => {
  plugin.reset();
});

describe('EzoicBannerAd.create', () => {
  it('creates a native banner view with normalized options', async () => {
    const banner = await EzoicBannerAd.create({
      adUnitIdentifier: 12345,
      size: ' 300x250 , 320x50 ',
      placement: { position: 'top', margin: 8.4 },
    });
    expect(banner.adUnitIdentifier).toBe('12345');
    expect(plugin.createAdView).toHaveBeenCalledWith({
      id: banner.id,
      kind: 'banner',
      adUnitIdentifier: '12345',
      size: '300x250,320x50',
      collapseOnNoFill: true,
      placement: { position: 'top', margin: 8 },
    });
  });

  it('defaults to a bottom placement and an adaptive size', async () => {
    const banner = await EzoicBannerAd.create({ adUnitIdentifier: '1' });
    expect(plugin.createAdView).toHaveBeenCalledWith(
      expect.objectContaining({ placement: { position: 'bottom' }, size: undefined }),
    );
    expect(banner.getPlacement()).toEqual({ position: 'bottom' });
  });

  it('rounds inline frames', async () => {
    await EzoicBannerAd.create({
      adUnitIdentifier: '1',
      placement: { position: 'inline', frame: { x: 10.4, y: 20.6, width: 300.2, height: -1 } },
    });
    expect(plugin.createAdView).toHaveBeenCalledWith(
      expect.objectContaining({
        placement: { position: 'inline', frame: { x: 10, y: 21, width: 300, height: 0 } },
      }),
    );
  });

  it('rejects an inline placement without a frame', async () => {
    await expect(
      EzoicBannerAd.create({ adUnitIdentifier: '1', placement: { position: 'inline' } as never }),
    ).rejects.toThrow(/frame/);
  });

  it('propagates a native create failure', async () => {
    plugin.createAdView.mockRejectedValue(new Error('nope'));
    await expect(EzoicBannerAd.create({ adUnitIdentifier: '1' })).rejects.toThrow('nope');
  });

  it('gives every view a distinct id', async () => {
    const a = await EzoicBannerAd.create({ adUnitIdentifier: '1' });
    const b = await EzoicBannerAd.create({ adUnitIdentifier: '1' });
    expect(a.id).not.toBe(b.id);
  });
});

describe('ad view lifecycle', () => {
  it('load/show/hide/destroy forward the id', async () => {
    const banner = await EzoicBannerAd.create({ adUnitIdentifier: '1' });
    await banner.load();
    await banner.show();
    await banner.hide();
    await banner.destroy();
    expect(plugin.loadAdView).toHaveBeenCalledWith({ id: banner.id });
    expect(plugin.showAdView).toHaveBeenCalledWith({ id: banner.id });
    expect(plugin.hideAdView).toHaveBeenCalledWith({ id: banner.id });
    expect(plugin.destroyAdView).toHaveBeenCalledWith({ id: banner.id });
  });

  it('setPlacement normalizes and remembers the placement', async () => {
    const banner = await EzoicBannerAd.create({ adUnitIdentifier: '1' });
    await banner.setPlacement({ position: 'bottom', margin: 12, height: 50.2 });
    expect(plugin.setAdViewPlacement).toHaveBeenCalledWith({
      id: banner.id,
      placement: { position: 'bottom', margin: 12, height: 50 },
    });
    expect(banner.getPlacement()).toEqual({ position: 'bottom', margin: 12, height: 50 });
  });

  it('destroy is idempotent and later calls throw', async () => {
    const banner = await EzoicBannerAd.create({ adUnitIdentifier: '1' });
    await banner.destroy();
    await banner.destroy();
    expect(plugin.destroyAdView).toHaveBeenCalledTimes(1);
    expect(() => banner.load()).toThrow(/destroyed/);
  });
});

describe('ad view events', () => {
  it('routes events by id to the right instance', async () => {
    const a = await EzoicBannerAd.create({ adUnitIdentifier: '1' });
    const b = await EzoicBannerAd.create({ adUnitIdentifier: '2' });
    await flush();
    const aLoad = vi.fn();
    const bLoad = vi.fn();
    a.setListeners({ onLoad: aLoad });
    b.setListeners({ onLoad: bLoad });

    plugin.emit('adViewEvent', { id: b.id, type: 'loaded' });
    expect(aLoad).not.toHaveBeenCalled();
    expect(bLoad).toHaveBeenCalledTimes(1);
    // One shared native listener regardless of the number of views.
    expect(plugin.listenerCount('adViewEvent')).toBe(1);
  });

  it('maps every event type', async () => {
    const banner = await EzoicBannerAd.create({ adUnitIdentifier: '1' });
    await flush();
    const listeners = {
      onLoad: vi.fn(),
      onError: vi.fn(),
      onImpression: vi.fn(),
      onClick: vi.fn(),
      onOpen: vi.fn(),
      onClose: vi.fn(),
      onSizeChange: vi.fn(),
    };
    banner.setListeners(listeners);
    const id = banner.id;
    plugin.emit('adViewEvent', { id, type: 'loaded' });
    plugin.emit('adViewEvent', { id, type: 'failed', message: 'No fill', code: 1005 });
    plugin.emit('adViewEvent', { id, type: 'impression' });
    plugin.emit('adViewEvent', { id, type: 'clicked' });
    plugin.emit('adViewEvent', { id, type: 'opened' });
    plugin.emit('adViewEvent', { id, type: 'closed' });
    plugin.emit('adViewEvent', { id, type: 'sizeChanged', width: 300, height: 250 });
    plugin.emit('adViewEvent', { id, type: 'sizeChanged' });

    expect(listeners.onLoad).toHaveBeenCalledTimes(1);
    expect(listeners.onError).toHaveBeenCalledWith({ message: 'No fill', code: 1005 });
    expect(listeners.onImpression).toHaveBeenCalledTimes(1);
    expect(listeners.onClick).toHaveBeenCalledTimes(1);
    expect(listeners.onOpen).toHaveBeenCalledTimes(1);
    expect(listeners.onClose).toHaveBeenCalledTimes(1);
    expect(listeners.onSizeChange).toHaveBeenNthCalledWith(1, { width: 300, height: 250 });
    expect(listeners.onSizeChange).toHaveBeenNthCalledWith(2, { width: 0, height: 0 });
  });

  it('defaults a failed event without a message or code', async () => {
    const banner = await EzoicBannerAd.create({ adUnitIdentifier: '1' });
    await flush();
    const onError = vi.fn();
    banner.setListeners({ onError });
    plugin.emit('adViewEvent', { id: banner.id, type: 'failed' });
    expect(onError).toHaveBeenCalledWith({ message: 'Unknown error', code: 0 });
  });

  it('stops delivering events after destroy', async () => {
    const banner = await EzoicBannerAd.create({ adUnitIdentifier: '1' });
    await flush();
    const onLoad = vi.fn();
    banner.setListeners({ onLoad });
    await banner.destroy();
    plugin.emit('adViewEvent', { id: banner.id, type: 'loaded' });
    expect(onLoad).not.toHaveBeenCalled();
  });
});

describe('attachTo', () => {
  function placeholder(rect: Partial<DOMRect>): HTMLElement {
    const el = document.createElement('div');
    document.body.appendChild(el);
    el.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        width: 0,
        height: 0,
        right: 0,
        bottom: 0,
        x: 0,
        y: 0,
        toJSON: () => ({}),
        ...rect,
      }) as DOMRect;
    return el;
  }

  it('switches to an inline placement over the element and syncs on scroll', async () => {
    const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0);
      return 1;
    });
    const el = placeholder({ left: 16, top: 400.4, width: 328, height: 250 });
    const banner = await EzoicBannerAd.create({ adUnitIdentifier: '1' });
    const detach = banner.attachTo(el);

    expect(plugin.setAdViewPlacement).toHaveBeenLastCalledWith({
      id: banner.id,
      placement: { position: 'inline', frame: { x: 16, y: 400, width: 328, height: 250 } },
    });

    el.getBoundingClientRect = () =>
      ({ left: 16, top: 100, width: 328, height: 250, right: 0, bottom: 0, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
    window.dispatchEvent(new Event('scroll'));
    expect(plugin.setAdViewPlacement).toHaveBeenLastCalledWith({
      id: banner.id,
      placement: { position: 'inline', frame: { x: 16, y: 100, width: 328, height: 250 } },
    });
    // An unchanged rect does not re-send the frame.
    const calls = plugin.setAdViewPlacement.mock.calls.length;
    window.dispatchEvent(new Event('scroll'));
    expect(plugin.setAdViewPlacement.mock.calls.length).toBe(calls);

    detach();
    window.dispatchEvent(new Event('scroll'));
    expect(plugin.setAdViewPlacement.mock.calls.length).toBe(calls);
    raf.mockRestore();
  });

  it('sets the element height from size changes (autoHeight) and collapses to 0', async () => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0);
      return 1;
    });
    const el = placeholder({ left: 0, top: 0, width: 320, height: 50 });
    const banner = await EzoicBannerAd.create({ adUnitIdentifier: '1' });
    await flush();
    banner.attachTo(el);
    const onSizeChange = vi.fn();
    banner.setListeners({ onSizeChange });

    plugin.emit('adViewEvent', { id: banner.id, type: 'sizeChanged', width: 320, height: 100 });
    expect(el.style.height).toBe('100px');
    expect(onSizeChange).toHaveBeenCalledWith({ width: 320, height: 100 });

    plugin.emit('adViewEvent', { id: banner.id, type: 'sizeChanged', width: 0, height: 0 });
    expect(el.style.height).toBe('0px');
  });

  it('leaves the element alone with autoHeight: false', async () => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0);
      return 1;
    });
    const el = placeholder({ left: 0, top: 0, width: 320, height: 50 });
    const banner = await EzoicBannerAd.create({ adUnitIdentifier: '1' });
    await flush();
    banner.attachTo(el, { autoHeight: false });
    plugin.emit('adViewEvent', { id: banner.id, type: 'sizeChanged', width: 320, height: 100 });
    expect(el.style.height).toBe('');
  });
});

describe('EzoicOutstreamAd / EzoicNativeAd', () => {
  it('outstream creates with collapseOnNoFill and no size', async () => {
    const ad = await EzoicOutstreamAd.create({ adUnitIdentifier: '7', collapseOnNoFill: false });
    expect(plugin.createAdView).toHaveBeenCalledWith({
      id: ad.id,
      kind: 'outstream',
      adUnitIdentifier: '7',
      collapseOnNoFill: false,
      placement: { position: 'bottom' },
    });
  });

  it('native creates with neither size nor collapse', async () => {
    const ad = await EzoicNativeAd.create({
      adUnitIdentifier: 9,
      placement: { position: 'top', height: 300 },
    });
    expect(plugin.createAdView).toHaveBeenCalledWith({
      id: ad.id,
      kind: 'native',
      adUnitIdentifier: '9',
      placement: { position: 'top', height: 300 },
    });
  });
});
