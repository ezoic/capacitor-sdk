import { describe, expect, it, vi } from 'vitest';

import { EzoicAdsWeb } from '../web';

describe('EzoicAdsWeb', () => {
  it('reports no built-in CMP and consent as not required', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const web = new EzoicAdsWeb();
    await expect(web.isBuiltInCmpIncluded()).resolves.toEqual({ included: false });
    await expect(web.presentConsentIfRequired()).resolves.toEqual({ type: 'notRequired' });
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});
