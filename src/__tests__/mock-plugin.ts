import { vi } from 'vitest';

type Listener = (event: unknown) => void;

/**
 * A fake of the native plugin: every method is a `vi.fn` resolving `undefined`
 * (override per test with `mockResolvedValue` / `mockRejectedValue`), and
 * `emit` delivers an event to the listeners registered via `addListener`.
 */
// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function createMockPlugin() {
  const listeners = new Map<string, Listener[]>();
  const defaults: Record<string, unknown> = {
    initialize: undefined,
    setGDPRConsent: undefined,
    setGPPConsent: undefined,
    setSubjectToCOPPA: undefined,
    trackPageview: { tracked: true },
    presentConsentIfRequired: { type: 'notRequired' },
    presentConsentSettings: { type: 'notRequired' },
    isConsentRequired: { required: null },
    resetConsent: undefined,
    createAdView: undefined,
    loadAdView: undefined,
    showAdView: undefined,
    hideAdView: undefined,
    setAdViewPlacement: undefined,
    destroyAdView: undefined,
    loadRewardedAd: undefined,
    showRewardedAd: { earned: false, type: '', amount: 0 },
    destroyRewardedAd: undefined,
    loadInterstitialAd: undefined,
    showInterstitialAd: undefined,
    destroyInterstitialAd: undefined,
    loadInstreamAd: { adTagUrl: 'https://tag' },
    getInstreamNextAdTagUrl: { adTagUrl: null },
    reportInstreamImpression: undefined,
    destroyInstreamAd: undefined,
  };
  const methods = Object.fromEntries(
    Object.entries(defaults).map(([name, value]) => [name, vi.fn().mockResolvedValue(value)]),
  ) as Record<keyof typeof defaults, ReturnType<typeof vi.fn>>;
  const plugin = {
    ...(methods as {
      initialize: ReturnType<typeof vi.fn>;
      setGDPRConsent: ReturnType<typeof vi.fn>;
      setGPPConsent: ReturnType<typeof vi.fn>;
      setSubjectToCOPPA: ReturnType<typeof vi.fn>;
      trackPageview: ReturnType<typeof vi.fn>;
      presentConsentIfRequired: ReturnType<typeof vi.fn>;
      presentConsentSettings: ReturnType<typeof vi.fn>;
      isConsentRequired: ReturnType<typeof vi.fn>;
      resetConsent: ReturnType<typeof vi.fn>;
      createAdView: ReturnType<typeof vi.fn>;
      loadAdView: ReturnType<typeof vi.fn>;
      showAdView: ReturnType<typeof vi.fn>;
      hideAdView: ReturnType<typeof vi.fn>;
      setAdViewPlacement: ReturnType<typeof vi.fn>;
      destroyAdView: ReturnType<typeof vi.fn>;
      loadRewardedAd: ReturnType<typeof vi.fn>;
      showRewardedAd: ReturnType<typeof vi.fn>;
      destroyRewardedAd: ReturnType<typeof vi.fn>;
      loadInterstitialAd: ReturnType<typeof vi.fn>;
      showInterstitialAd: ReturnType<typeof vi.fn>;
      destroyInterstitialAd: ReturnType<typeof vi.fn>;
      loadInstreamAd: ReturnType<typeof vi.fn>;
      getInstreamNextAdTagUrl: ReturnType<typeof vi.fn>;
      reportInstreamImpression: ReturnType<typeof vi.fn>;
      destroyInstreamAd: ReturnType<typeof vi.fn>;
    }),
    /**
     * Clears call history and restores the default resolved values. The
     * event hubs in `events.ts` subscribe to the plugin once per module, so
     * tests reuse one plugin per file and reset it between tests.
     */
    reset() {
      for (const [name, value] of Object.entries(defaults)) {
        methods[name].mockReset().mockResolvedValue(value);
      }
    },
    addListener: vi.fn((eventName: string, listener: Listener) => {
      const list = listeners.get(eventName) ?? [];
      list.push(listener);
      listeners.set(eventName, list);
      return Promise.resolve({
        remove: async () => {
          listeners.set(
            eventName,
            (listeners.get(eventName) ?? []).filter((l) => l !== listener),
          );
        },
      });
    }),
    emit(eventName: string, event: unknown) {
      for (const l of listeners.get(eventName) ?? []) l(event);
    },
    listenerCount(eventName: string) {
      return (listeners.get(eventName) ?? []).length;
    },
  };
  return plugin;
}

export type MockPlugin = ReturnType<typeof createMockPlugin>;

/** Flushes pending microtasks so `addListener` promises settle. */
export const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
