import type { EzoicAdPlacement, EzoicConfig, EzoicReward, EzoicRewardResult } from './definitions';

export function normalizeConfig(config: EzoicConfig): EzoicConfig {
  if (!config?.domain) {
    throw new Error('EzoicAds.initialize requires a non-empty `domain`.');
  }
  const out: EzoicConfig = { domain: config.domain };
  if (config.autoReadConsent !== undefined) out.autoReadConsent = config.autoReadConsent;
  if (config.subjectToCOPPA !== undefined) out.subjectToCOPPA = config.subjectToCOPPA;
  if (config.requestATTBeforeAds !== undefined) out.requestATTBeforeAds = config.requestATTBeforeAds;
  if (config.debugEnabled !== undefined) out.debugEnabled = config.debugEnabled;
  if (config.testMode !== undefined) out.testMode = config.testMode;
  if (config.autoTrackPageviews !== undefined) out.autoTrackPageviews = config.autoTrackPageviews;
  if (config.cmpEnabled !== undefined) out.cmpEnabled = config.cmpEnabled;
  if (config.autoPresentConsent !== undefined) out.autoPresentConsent = config.autoPresentConsent;
  return out;
}

/** Trims a `"WxH,WxH"` size list; `undefined`/empty becomes `undefined` (adaptive). */
export function normalizeSize(size: string | undefined): string | undefined {
  if (!size) return undefined;
  const out = size
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .join(',');
  return out.length > 0 ? out : undefined;
}

export function coerceAdUnitId(adUnitIdentifier: string | number): string {
  return String(adUnitIdentifier);
}

/** Default overlay placement when none is given. */
export const DEFAULT_PLACEMENT: EzoicAdPlacement = { position: 'bottom' };

/** Rounds a frame to whole CSS pixels and clamps negative sizes to 0. */
export function normalizePlacement(placement: EzoicAdPlacement | undefined): EzoicAdPlacement {
  if (!placement) return DEFAULT_PLACEMENT;
  if (placement.position === 'inline') {
    const f = placement.frame;
    if (!f) throw new Error("An 'inline' placement requires a `frame`.");
    return {
      position: 'inline',
      frame: {
        x: Math.round(f.x),
        y: Math.round(f.y),
        width: Math.max(0, Math.round(f.width)),
        height: Math.max(0, Math.round(f.height)),
      },
    };
  }
  if (placement.position !== 'top' && placement.position !== 'bottom') {
    throw new Error(`Unknown placement position: ${String((placement as { position: unknown }).position)}`);
  }
  const out: EzoicAdPlacement = { position: placement.position };
  if (placement.margin !== undefined) out.margin = Math.max(0, Math.round(placement.margin));
  if (placement.width !== undefined) out.width = Math.max(0, Math.round(placement.width));
  if (placement.height !== undefined) out.height = Math.max(0, Math.round(placement.height));
  return out;
}

/**
 * Maps the native `showRewardedAd` result to the public reward shape: the
 * `{ type, amount }` reward when earned, otherwise `null` (dismissed unearned).
 */
export function mapRewardResult(result: EzoicRewardResult | null | undefined): EzoicReward | null {
  if (result?.earned) {
    return { type: result.type, amount: result.amount };
  }
  return null;
}

/**
 * Returns the numeric native `EzoicError` code carried by a rejected plugin
 * promise, or `undefined` when the rejection has none (plugin-side validation
 * errors, web, unknown shapes). The native plugin rejects with the code both
 * as the string `code` and as `data.code`.
 */
export function getEzoicErrorCode(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const { code, data } = error as { code?: unknown; data?: unknown };
  if (data && typeof data === 'object') {
    const dataCode = (data as { code?: unknown }).code;
    if (typeof dataCode === 'number' && Number.isFinite(dataCode)) return dataCode;
  }
  if (typeof code === 'number' && Number.isFinite(code)) return code;
  if (typeof code === 'string' && /^-?\d+$/.test(code)) return Number(code);
  return undefined;
}
