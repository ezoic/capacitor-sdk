import { registerPlugin } from '@capacitor/core';

import type { EzoicAdsPlugin } from './definitions';

/**
 * The registered native plugin. `jsName` is `EzoicAds` on both platforms; on
 * the web the no-op implementation in `web.ts` is used.
 */
export const EzoicAdsNative = registerPlugin<EzoicAdsPlugin>('EzoicAds', {
  web: () => import('./web').then((m) => new m.EzoicAdsWeb()),
});
