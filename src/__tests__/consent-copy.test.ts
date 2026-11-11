// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';

// Both packages parse native consent outcomes the same way; the CMP package
// keeps its own copy so it has no dependency on the ads package.
it('the CMP package parses consent outcomes with the same code', () => {
  const read = (path: string) => readFileSync(resolve(__dirname, '..', '..', path), 'utf8');
  expect(read('cmp/src/consent.ts')).toBe(read('src/consent.ts'));
});
