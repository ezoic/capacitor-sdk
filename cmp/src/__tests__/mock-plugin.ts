import { vi } from 'vitest';

/**
 * A fake of the native `EzoicCmp` plugin: every method is a `vi.fn` resolving
 * its default (override per test with `mockResolvedValue` / `mockRejectedValue`).
 */
// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function createMockPlugin() {
  const defaults = {
    initialize: undefined,
    presentConsentIfRequired: { type: 'notRequired' },
    presentConsentSettings: { type: 'notRequired' },
    isConsentRequired: { required: null },
    isPrivacyOptionsRequired: { required: null },
    resetConsent: undefined,
  };
  type Name = keyof typeof defaults;
  const methods = Object.fromEntries(
    Object.entries(defaults).map(([name, value]) => [name, vi.fn().mockResolvedValue(value)]),
  ) as Record<Name, ReturnType<typeof vi.fn>>;
  return {
    ...methods,
    /** Clears call history and restores the default resolved values. */
    reset() {
      for (const [name, value] of Object.entries(defaults)) {
        methods[name as Name].mockReset().mockResolvedValue(value);
      }
    },
  };
}
