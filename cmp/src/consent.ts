import type { EzoicConsentDecision, EzoicConsentOutcome } from './definitions';

const SIMPLE_TYPES = ['notRequired', 'alreadyDecided', 'dismissed', 'alreadyPresenting'] as const;

const DECISIONS: readonly string[] = ['acceptAll', 'rejectAll', 'custom'];

export function consentFailure(code: number, message: string): EzoicConsentOutcome {
  return { type: 'failed', code, message };
}

/**
 * Maps the native plugin's outcome object to `EzoicConsentOutcome`. Anything
 * that doesn't match the wire format becomes `failed(-1, 'Unrecognized outcome')`.
 */
export function parseConsentOutcome(raw: unknown): EzoicConsentOutcome {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const { type, decision, code, message } = raw as Record<string, unknown>;
    const simple = SIMPLE_TYPES.find((t) => t === type);
    if (simple) return { type: simple };
    if (type === 'decided' && typeof decision === 'string' && DECISIONS.includes(decision)) {
      return { type: 'decided', decision: decision as EzoicConsentDecision };
    }
    if (type === 'failed') {
      return consentFailure(
        typeof code === 'number' ? code : -1,
        typeof message === 'string' ? message : 'Unknown error',
      );
    }
  }
  return consentFailure(-1, 'Unrecognized outcome');
}
