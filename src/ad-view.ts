import type {
  EzoicAdError,
  EzoicAdPlacement,
  EzoicAdSize,
  EzoicAdViewEvent,
  EzoicAdViewKind,
  EzoicAdViewListeners,
  EzoicAttachOptions,
  EzoicBannerAdOptions,
  EzoicNativeAdListeners,
  EzoicNativeAdOptions,
  EzoicOutstreamAdOptions,
} from './definitions';
import { adViewEvents } from './events';
import { coerceAdUnitId, normalizePlacement, normalizeSize } from './helpers';
import { EzoicAdsNative } from './plugin';

let nextViewId = 0;

/**
 * Keeps an `inline` ad view's frame in sync with a DOM element: re-measures on
 * scroll (any scroll container, captured at the window), resize, element
 * resize, and visual-viewport changes, coalesced to one call per animation
 * frame. Returns a detach function.
 */
function trackElement(element: Element, onFrame: (frame: DOMRect) => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  let scheduled = false;
  let last: { x: number; y: number; w: number; h: number } | null = null;
  const measure = () => {
    scheduled = false;
    const rect = element.getBoundingClientRect();
    const next = {
      x: Math.round(rect.left),
      y: Math.round(rect.top),
      w: Math.round(rect.width),
      h: Math.round(rect.height),
    };
    if (last && last.x === next.x && last.y === next.y && last.w === next.w && last.h === next.h) return;
    last = next;
    onFrame(rect);
  };
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(measure);
  };

  window.addEventListener('scroll', schedule, { capture: true, passive: true });
  window.addEventListener('resize', schedule, { passive: true });
  window.addEventListener('orientationchange', schedule, { passive: true });
  const vv = window.visualViewport;
  vv?.addEventListener('resize', schedule);
  vv?.addEventListener('scroll', schedule);
  let resizeObserver: ResizeObserver | undefined;
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(schedule);
    resizeObserver.observe(element);
    // The element's position also moves when anything above it changes
    // size; observing the document element catches most layout shifts.
    if (document.documentElement) resizeObserver.observe(document.documentElement);
  }
  measure();

  return () => {
    window.removeEventListener('scroll', schedule, { capture: true });
    window.removeEventListener('resize', schedule);
    window.removeEventListener('orientationchange', schedule);
    vv?.removeEventListener('resize', schedule);
    vv?.removeEventListener('scroll', schedule);
    resizeObserver?.disconnect();
  };
}

/**
 * Base for the overlaid ad views (banner, outstream, native). Owns the native
 * view's id, placement, visibility and event routing. Subclasses only differ
 * in their `create` options and listener shape.
 */
export abstract class EzoicAdViewBase<L extends EzoicNativeAdListeners> {
  /** The Ezoic ad unit identifier this view was created for. */
  readonly adUnitIdentifier: string;
  /** @internal */
  readonly id: string;

  protected listeners: L = {} as L;
  private placement: EzoicAdPlacement;
  private destroyed = false;
  private detachElement: (() => void) | null = null;
  private attachedElement: HTMLElement | null = null;
  private autoHeight = true;

  protected constructor(kind: EzoicAdViewKind, adUnitIdentifier: string, placement: EzoicAdPlacement) {
    this.id = `ezoic-${kind}-${++nextViewId}`;
    this.adUnitIdentifier = adUnitIdentifier;
    this.placement = placement;
    adViewEvents.subscribe(this.id, (event) => this.handleEvent(event));
  }

  /** The current overlay placement. */
  getPlacement(): EzoicAdPlacement {
    return this.placement;
  }

  /** Registers lifecycle callbacks. Replaces any previously set listeners. */
  setListeners(listeners: L): void {
    this.listeners = listeners;
  }

  /**
   * Starts loading the ad. The native view is created and overlaid at the
   * configured placement (hidden / zero-height until a creative fills). Call
   * once; auto-refresh is driven by the Ezoic configuration.
   */
  load(): Promise<void> {
    this.assertAlive();
    return EzoicAdsNative.loadAdView({ id: this.id });
  }

  /** Makes a hidden view visible again. A view collapsed after a no-fill stays collapsed. */
  show(): Promise<void> {
    this.assertAlive();
    return EzoicAdsNative.showAdView({ id: this.id });
  }

  /** Hides the view without destroying it (the ad keeps refreshing natively). */
  hide(): Promise<void> {
    this.assertAlive();
    return EzoicAdsNative.hideAdView({ id: this.id });
  }

  /** Moves/resizes the overlay. For `inline` views, prefer `attachTo`. */
  setPlacement(placement: EzoicAdPlacement): Promise<void> {
    this.assertAlive();
    this.placement = normalizePlacement(placement);
    return EzoicAdsNative.setAdViewPlacement({ id: this.id, placement: this.placement });
  }

  /**
   * Switches the view to an `inline` placement that follows `element`: the
   * native view is positioned over the element's bounding box and re-synced
   * on scroll, resize and layout changes. With `autoHeight` (default) the
   * element's `height` style is set from `onSizeChange`, so the page reflows
   * around the filled creative and collapses when there is no fill.
   *
   * Give the element a width (and optionally a min-height for the expected
   * creative) in your CSS. Returns a function that stops tracking.
   */
  attachTo(element: HTMLElement, options: EzoicAttachOptions = {}): () => void {
    this.assertAlive();
    this.detach();
    this.attachedElement = element;
    this.autoHeight = options.autoHeight !== false;
    this.detachElement = trackElement(element, (rect) => {
      this.placement = normalizePlacement({
        position: 'inline',
        frame: { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
      });
      if (this.destroyed) return;
      EzoicAdsNative.setAdViewPlacement({ id: this.id, placement: this.placement }).catch(() => undefined);
    });
    return () => this.detach();
  }

  /** Stops following the element attached with `attachTo` (the view stays where it is). */
  detach(): void {
    this.detachElement?.();
    this.detachElement = null;
    this.attachedElement = null;
  }

  /**
   * Removes the native view and releases the ad. Safe to call multiple times;
   * every other method rejects afterwards.
   */
  async destroy(): Promise<void> {
    if (this.destroyed) return;
    this.destroyed = true;
    this.detach();
    adViewEvents.unsubscribe(this.id);
    this.listeners = {} as L;
    await EzoicAdsNative.destroyAdView({ id: this.id });
  }

  protected handleEvent(event: EzoicAdViewEvent): void {
    switch (event.type) {
      case 'loaded':
        this.listeners.onLoad?.();
        break;
      case 'failed':
        this.listeners.onError?.(toError(event));
        break;
      case 'impression':
        this.listeners.onImpression?.();
        break;
      case 'clicked':
        this.listeners.onClick?.();
        break;
      case 'opened':
        this.listeners.onOpen?.();
        break;
      case 'closed':
        this.listeners.onClose?.();
        break;
      case 'sizeChanged':
        this.handleSizeChange({ width: event.width ?? 0, height: event.height ?? 0 });
        break;
    }
  }

  protected handleSizeChange(size: EzoicAdSize): void {
    if (this.attachedElement && this.autoHeight) {
      this.attachedElement.style.height = `${size.height}px`;
    }
    (this.listeners as EzoicAdViewListeners).onSizeChange?.(size);
  }

  private assertAlive(): void {
    if (this.destroyed) {
      throw new Error(`This ${this.constructor.name} has been destroyed.`);
    }
  }
}

function toError(event: EzoicAdViewEvent): EzoicAdError {
  return { message: event.message ?? 'Unknown error', code: typeof event.code === 'number' ? event.code : 0 };
}

/**
 * A banner ad overlaid on the WebView.
 *
 * ```ts
 * const banner = await EzoicBannerAd.create({ adUnitIdentifier: '12345', size: '300x250' });
 * banner.attachTo(document.getElementById('ad-slot')!);
 * banner.setListeners({ onError: (e) => console.warn(e.message) });
 * await banner.load();
 * // later
 * await banner.destroy();
 * ```
 *
 * Mirrors the native `EzoicBannerView`: `collapseOnNoFill` (default `true`)
 * collapses the view to height 0 when a load fails and nothing is displayed;
 * `onSizeChange` reports the creative size, or 0x0 on collapse.
 */
export class EzoicBannerAd extends EzoicAdViewBase<EzoicAdViewListeners> {
  private constructor(adUnitIdentifier: string, placement: EzoicAdPlacement) {
    super('banner', adUnitIdentifier, placement);
  }

  /** Creates the native banner view (not yet loading). */
  static async create(options: EzoicBannerAdOptions): Promise<EzoicBannerAd> {
    const placement = normalizePlacement(options.placement);
    const ad = new EzoicBannerAd(coerceAdUnitId(options.adUnitIdentifier), placement);
    try {
      await EzoicAdsNative.createAdView({
        id: ad.id,
        kind: 'banner',
        adUnitIdentifier: ad.adUnitIdentifier,
        size: normalizeSize(options.size),
        collapseOnNoFill: options.collapseOnNoFill ?? true,
        placement,
      });
      return ad;
    } catch (error) {
      adViewEvents.unsubscribe(ad.id);
      throw error;
    }
  }
}

/**
 * An outstream video ad overlaid on the WebView. The SDK owns the player, so
 * the view only needs a size: the placement `height` (default 250) for
 * `top`/`bottom`, or the attached element's box for `inline`. Same
 * `collapseOnNoFill` / `onSizeChange` behaviour as `EzoicBannerAd`.
 */
export class EzoicOutstreamAd extends EzoicAdViewBase<EzoicAdViewListeners> {
  private constructor(adUnitIdentifier: string, placement: EzoicAdPlacement) {
    super('outstream', adUnitIdentifier, placement);
  }

  /** Creates the native outstream view (not yet loading). */
  static async create(options: EzoicOutstreamAdOptions): Promise<EzoicOutstreamAd> {
    const placement = normalizePlacement(options.placement);
    const ad = new EzoicOutstreamAd(coerceAdUnitId(options.adUnitIdentifier), placement);
    try {
      await EzoicAdsNative.createAdView({
        id: ad.id,
        kind: 'outstream',
        adUnitIdentifier: ad.adUnitIdentifier,
        collapseOnNoFill: options.collapseOnNoFill ?? true,
        placement,
      });
      return ad;
    } catch (error) {
      adViewEvents.unsubscribe(ad.id);
      throw error;
    }
  }
}

/**
 * A native ad rendered in an SDK-built template (headline, icon, media, body
 * and call to action) and overlaid on the WebView. Size it with the placement
 * `height` (default 300) for `top`/`bottom`, or the attached element's box for
 * `inline`. Native ads never collapse and report no size change.
 */
export class EzoicNativeAd extends EzoicAdViewBase<EzoicNativeAdListeners> {
  private constructor(adUnitIdentifier: string, placement: EzoicAdPlacement) {
    super('native', adUnitIdentifier, placement);
  }

  /** Creates the native ad view (not yet loading). */
  static async create(options: EzoicNativeAdOptions): Promise<EzoicNativeAd> {
    const placement = normalizePlacement(options.placement);
    const ad = new EzoicNativeAd(coerceAdUnitId(options.adUnitIdentifier), placement);
    try {
      await EzoicAdsNative.createAdView({
        id: ad.id,
        kind: 'native',
        adUnitIdentifier: ad.adUnitIdentifier,
        placement,
      });
      return ad;
    } catch (error) {
      adViewEvents.unsubscribe(ad.id);
      throw error;
    }
  }
}
