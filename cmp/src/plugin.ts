import { registerPlugin } from '@capacitor/core';

import type { EzoicCmpPlugin } from './definitions';

/**
 * The registered native plugin. `jsName` is `EzoicCmp` on both platforms; on
 * the web the no-op implementation in `web.ts` is used.
 */
export const EzoicCmpNative = registerPlugin<EzoicCmpPlugin>('EzoicCmp', {
  web: () => import('./web').then((m) => new m.EzoicCmpWeb()),
});
