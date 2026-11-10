// @vitest-environment node
import { execFile, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const script = resolve(__dirname, '..', 'fetch-ios-sdk.js');
const VERSION = '9.9.9';

interface Result {
  code: number;
  stdout: string;
  stderr: string;
}

let work: string;
let zips: string;
let server: Server;
let baseUrl: string;

/** Writes `<name>.xcframework` with the given slices and zips it as the release asset. */
function makeZip(asset: string, framework: string, slices = ['ios-arm64', 'ios-arm64_x86_64-simulator']): string {
  const stage = mkdtempSync(join(work, 'stage-'));
  const xcf = join(stage, `${framework}.xcframework`);
  mkdirSync(xcf, { recursive: true });
  writeFileSync(join(xcf, 'Info.plist'), '<plist/>');
  for (const slice of slices) {
    const fw = join(xcf, slice, `${framework}.framework`);
    mkdirSync(fw, { recursive: true });
    writeFileSync(join(fw, framework), `binary ${framework} ${slice}`);
  }
  const zip = join(zips, `${asset}-${VERSION}-cocoapods.xcframework.zip`);
  rmSync(zip, { force: true });
  execFileSync('zip', ['-qry', zip, `${framework}.xcframework`], { cwd: stage });
  return createHash('sha256').update(readFileSync(zip)).digest('hex');
}

function writePackage(shas: { ads: string; cmp: string }): string {
  const pkg = join(work, 'package.json');
  const json = {
    name: 'fixture',
    version: '1.0.0',
    ezoic: {
      iosSdk: {
        version: VERSION,
        frameworks: {
          EzoicAdsSDKBinary: { asset: 'EzoicAdsSDK', sha256: shas.ads },
          EzoicCmpSDKBinary: { asset: 'EzoicCmpSDK', sha256: shas.cmp },
        },
      },
    },
  };
  writeFileSync(pkg, JSON.stringify(json, null, 2) + '\n');
  return pkg;
}

function run(args: string[], env: Record<string, string> = {}): Promise<Result> {
  return new Promise((done) => {
    execFile(
      process.execPath,
      [script, '--package', join(work, 'package.json'), '--dest', join(work, 'Frameworks'), ...args],
      { env: { ...process.env, EZOIC_IOS_SDK_BASE_URL: baseUrl, EZOIC_IOS_SDK_ZIP_DIR: '', ...env } },
      (error, stdout, stderr) => done({ code: error ? ((error as { code?: number }).code ?? 1) : 0, stdout, stderr }),
    );
  });
}

beforeAll(async () => {
  server = createServer((req, res) => {
    // Serves <zips>/<asset zip> for /<version>/<asset zip>.
    const name = (req.url ?? '').split('/').pop() ?? '';
    const file = join(zips, name);
    if (!req.url?.startsWith(`/${VERSION}/`) || !existsSync(file)) {
      res.statusCode = 404;
      res.end();
      return;
    }
    res.end(readFileSync(file));
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  server.close();
});

beforeEach(() => {
  work = mkdtempSync(join(tmpdir(), 'fetch-ios-sdk-'));
  zips = join(work, 'zips');
  mkdirSync(zips);
});

describe('fetch-ios-sdk', () => {
  it('fails on the TODO-RELEASE placeholder and points at --pin', async () => {
    makeZip('EzoicAdsSDK', 'EzoicAdsSDKBinary');
    makeZip('EzoicCmpSDK', 'EzoicCmpSDKBinary');
    writePackage({ ads: 'TODO-RELEASE', cmp: 'TODO-RELEASE' });
    const r = await run([]);
    expect(r.code).not.toBe(0);
    expect(r.stderr).toContain('TODO-RELEASE');
    expect(r.stderr).toContain('--pin');
    expect(existsSync(join(work, 'Frameworks', 'EzoicAdsSDKBinary.xcframework'))).toBe(false);
  });

  it('downloads, verifies and extracts every pinned framework; --check then passes', async () => {
    const ads = makeZip('EzoicAdsSDK', 'EzoicAdsSDKBinary');
    const cmp = makeZip('EzoicCmpSDK', 'EzoicCmpSDKBinary');
    writePackage({ ads, cmp });
    const r = await run([]);
    expect(r.stderr).toBe('');
    expect(r.code).toBe(0);
    for (const fw of ['EzoicAdsSDKBinary', 'EzoicCmpSDKBinary']) {
      expect(existsSync(join(work, 'Frameworks', `${fw}.xcframework`, 'ios-arm64', `${fw}.framework`, fw))).toBe(true);
    }
    expect(JSON.parse(readFileSync(join(work, 'Frameworks', '.EzoicCmpSDKBinary.json'), 'utf8'))).toEqual({
      version: VERSION,
      sha256: cmp,
    });
    expect((await run(['--check'])).code).toBe(0);
  });

  it('rejects a download whose sha256 does not match the pin', async () => {
    makeZip('EzoicAdsSDK', 'EzoicAdsSDKBinary');
    const cmp = makeZip('EzoicCmpSDK', 'EzoicCmpSDKBinary');
    writePackage({ ads: 'a'.repeat(64), cmp });
    const r = await run([]);
    expect(r.code).not.toBe(0);
    expect(r.stderr).toContain('SHA-256 mismatch');
    expect(existsSync(join(work, 'Frameworks', 'EzoicAdsSDKBinary.xcframework'))).toBe(false);
  });

  it('--only limits the run to the named frameworks', async () => {
    makeZip('EzoicAdsSDK', 'EzoicAdsSDKBinary');
    const cmp = makeZip('EzoicCmpSDK', 'EzoicCmpSDKBinary');
    writePackage({ ads: 'TODO-RELEASE', cmp });
    const r = await run(['--only', 'EzoicCmpSDKBinary']);
    expect(r.code).toBe(0);
    expect(existsSync(join(work, 'Frameworks', 'EzoicCmpSDKBinary.xcframework'))).toBe(true);
    expect(existsSync(join(work, 'Frameworks', 'EzoicAdsSDKBinary.xcframework'))).toBe(false);
  });

  it('rejects an archive missing a slice', async () => {
    const ads = makeZip('EzoicAdsSDK', 'EzoicAdsSDKBinary', ['ios-arm64']);
    const cmp = makeZip('EzoicCmpSDK', 'EzoicCmpSDKBinary');
    writePackage({ ads, cmp });
    const r = await run([]);
    expect(r.code).not.toBe(0);
    expect(r.stderr).toContain('ios-*-simulator');
  });

  it('extracts local zips from EZOIC_IOS_SDK_ZIP_DIR without a pin, and --check refuses them', async () => {
    makeZip('EzoicAdsSDK', 'EzoicAdsSDKBinary');
    makeZip('EzoicCmpSDK', 'EzoicCmpSDKBinary');
    writePackage({ ads: 'TODO-RELEASE', cmp: 'TODO-RELEASE' });
    const r = await run([], { EZOIC_IOS_SDK_ZIP_DIR: zips });
    expect(r.code).toBe(0);
    expect(existsSync(join(work, 'Frameworks', 'EzoicAdsSDKBinary.xcframework', 'Info.plist'))).toBe(true);
    expect(JSON.parse(readFileSync(join(work, 'Frameworks', '.EzoicAdsSDKBinary.json'), 'utf8')).sha256).toBe('local');
    const check = await run(['--check']);
    expect(check.code).not.toBe(0);
  });

  it('checks a local zip against its .sha256 file when one is present', async () => {
    makeZip('EzoicAdsSDK', 'EzoicAdsSDKBinary');
    makeZip('EzoicCmpSDK', 'EzoicCmpSDKBinary');
    writeFileSync(join(zips, `EzoicCmpSDK-${VERSION}-cocoapods.xcframework.zip.sha256`), 'b'.repeat(64) + '\n');
    writePackage({ ads: 'TODO-RELEASE', cmp: 'TODO-RELEASE' });
    const r = await run([], { EZOIC_IOS_SDK_ZIP_DIR: zips });
    expect(r.code).not.toBe(0);
    expect(r.stderr).toContain('SHA-256 mismatch');
  });

  it('--pin writes the release sha256s into package.json', async () => {
    const ads = makeZip('EzoicAdsSDK', 'EzoicAdsSDKBinary');
    const cmp = makeZip('EzoicCmpSDK', 'EzoicCmpSDKBinary');
    const pkg = writePackage({ ads: 'TODO-RELEASE', cmp: 'TODO-RELEASE' });
    const r = await run(['--pin']);
    expect(r.code).toBe(0);
    const text = readFileSync(pkg, 'utf8');
    expect(text.endsWith('}\n')).toBe(true);
    const frameworks = JSON.parse(text).ezoic.iosSdk.frameworks;
    expect(frameworks.EzoicAdsSDKBinary.sha256).toBe(ads);
    expect(frameworks.EzoicCmpSDKBinary.sha256).toBe(cmp);
  });
});
