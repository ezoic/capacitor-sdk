#!/usr/bin/env node
/**
 * Downloads the native iOS XCFrameworks (CocoaPods flavour) pinned in the
 * root package.json `ezoic.iosSdk`, verifies each SHA-256 and extracts them to
 * ios/Frameworks, where the podspecs vendor them from. CocoaPods trunk is
 * frozen, so the pods ship these frameworks in the npm packages instead.
 *
 *   node scripts/fetch-ios-sdk.js          download what is missing or out of date
 *   node scripts/fetch-ios-sdk.js --force  always re-download
 *   node scripts/fetch-ios-sdk.js --check  verify only, never download
 *   node scripts/fetch-ios-sdk.js --pin    download the release assets and write
 *                                          their SHA-256s into package.json
 *
 * Options:
 *   --dest <dir>       extract here (default: <repo>/ios/Frameworks)
 *   --only <A,B>       only these frameworks (keys of `ezoic.iosSdk.frameworks`)
 *   --package <file>   read the pins from this package.json (default: the repo root's)
 *
 * EZOIC_IOS_SDK_ZIP_DIR=<dir> takes the zips from <dir> instead of the GitHub
 * release, for testing unreleased builds. A zip is checked against a sibling
 * `<zip>.sha256` file when there is one, not against the pin, and is stamped
 * `local`, so `--check` (run before publishing) rejects it.
 */
'use strict';

const { Buffer } = require('node:buffer');
const { spawnSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const PLACEHOLDER = 'TODO-RELEASE';
const LOCAL = 'local';

function parseArgs(argv) {
  const root = path.resolve(__dirname, '..');
  const args = {
    packageFile: path.join(root, 'package.json'),
    dest: path.join(root, 'ios', 'Frameworks'),
    only: null,
    mode: 'fetch',
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = () => {
      if (i + 1 >= argv.length) throw new Error(`${arg} needs a value`);
      return argv[++i];
    };
    if (arg === '--package') args.packageFile = path.resolve(value());
    else if (arg === '--dest') args.dest = path.resolve(value());
    else if (arg === '--only') args.only = value().split(',').filter(Boolean);
    else if (arg === '--check') args.mode = 'check';
    else if (arg === '--force') args.mode = 'force';
    else if (arg === '--pin') args.mode = 'pin';
    else throw new Error(`unknown argument ${arg}`);
  }
  return args;
}

function loadPins(args) {
  const pkg = JSON.parse(fs.readFileSync(args.packageFile, 'utf8'));
  const iosSdk = pkg.ezoic && pkg.ezoic.iosSdk;
  if (!iosSdk || !iosSdk.version || !iosSdk.frameworks) {
    throw new Error(`${args.packageFile} has no ezoic.iosSdk.{version,frameworks}`);
  }
  let names = Object.keys(iosSdk.frameworks);
  if (args.only) {
    const unknown = args.only.filter((name) => !names.includes(name));
    if (unknown.length > 0) throw new Error(`unknown framework(s): ${unknown.join(', ')}`);
    names = args.only;
  }
  const baseUrl =
    process.env.EZOIC_IOS_SDK_BASE_URL || 'https://github.com/ezoic/ezoic-swift-sdk-dist/releases/download';
  const frameworks = names.map((name) => {
    const { asset, sha256 } = iosSdk.frameworks[name];
    const zipName = `${asset}-${iosSdk.version}-cocoapods.xcframework.zip`;
    return {
      name,
      sha256,
      zipName,
      url: `${baseUrl}/${iosSdk.version}/${zipName}`,
      dir: path.join(args.dest, `${name}.xcframework`),
      stampFile: path.join(args.dest, `.${name}.json`),
    };
  });
  return { pkg, version: iosSdk.version, frameworks };
}

function requirePin(fw) {
  if (fw.sha256 === PLACEHOLDER) {
    throw new Error(
      `ezoic.iosSdk.frameworks.${fw.name}.sha256 is the ${PLACEHOLDER} placeholder; ` +
        'once the native release is published run `node scripts/fetch-ios-sdk.js --pin`',
    );
  }
  if (!/^[0-9a-f]{64}$/.test(fw.sha256 || '')) {
    throw new Error(`ezoic.iosSdk.frameworks.${fw.name}.sha256 must be a 64-char hex SHA-256`);
  }
}

function missingSlices(dir, name) {
  if (!fs.existsSync(path.join(dir, 'Info.plist'))) return ['Info.plist'];
  const slices = fs.readdirSync(dir).filter((entry) => entry.startsWith('ios-'));
  const missing = [];
  if (!slices.includes('ios-arm64')) missing.push('ios-arm64');
  if (!slices.some((entry) => entry.endsWith('-simulator'))) missing.push('ios-*-simulator');
  for (const slice of slices) {
    const binary = path.join(dir, slice, `${name}.framework`, name);
    if (!fs.existsSync(binary)) missing.push(path.relative(dir, binary));
  }
  return missing;
}

function readStamp(fw) {
  try {
    return JSON.parse(fs.readFileSync(fw.stampFile, 'utf8'));
  } catch {
    return null;
  }
}

function isCurrent(fw, version, sha256) {
  const stamp = readStamp(fw);
  return (
    stamp !== null &&
    stamp.version === version &&
    stamp.sha256 === sha256 &&
    missingSlices(fw.dir, fw.name).length === 0
  );
}

async function download(url) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (error) {
      lastError = error;
      console.warn(`fetch-ios-sdk: attempt ${attempt} failed for ${url}: ${error.message}`);
    }
  }
  throw new Error(`could not download ${url}: ${lastError.message}`);
}

function sha256Of(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/** The zip and the SHA-256 it must have: the pin, or a local zip's `.sha256` file. */
async function obtainZip(fw, localDir) {
  if (localDir) {
    const zipPath = path.join(localDir, fw.zipName);
    const zip = fs.readFileSync(zipPath);
    const shaFile = `${zipPath}.sha256`;
    const expected = fs.existsSync(shaFile) ? fs.readFileSync(shaFile, 'utf8').trim().split(/\s+/)[0] : sha256Of(zip);
    return { zip, source: zipPath, expected };
  }
  console.log(`fetch-ios-sdk: downloading ${fw.url}`);
  return { zip: await download(fw.url), source: fw.url, expected: fw.sha256 };
}

function extract(fw, zip, dest, stamp) {
  fs.mkdirSync(dest, { recursive: true });
  // Stage inside dest so the final rename never crosses filesystems.
  const staging = fs.mkdtempSync(path.join(dest, '.staging-'));
  try {
    const zipPath = path.join(staging, 'sdk.zip');
    fs.writeFileSync(zipPath, zip);
    const outDir = path.join(staging, 'out');
    // Info-ZIP `unzip` (macOS and ubuntu-latest) restores symlinks.
    const unzip = spawnSync('unzip', ['-q', zipPath, '-d', outDir], { stdio: 'inherit' });
    if (unzip.error || unzip.status !== 0) {
      throw new Error(`unzip failed: ${unzip.error ? unzip.error.message : `exit ${unzip.status}`}`);
    }
    const extracted = path.join(outDir, path.basename(fw.dir));
    const missing = missingSlices(extracted, fw.name);
    if (missing.length > 0) {
      throw new Error(`unexpected archive layout for ${fw.zipName}, missing: ${missing.join(', ')}`);
    }
    fs.rmSync(fw.stampFile, { force: true });
    fs.rmSync(fw.dir, { recursive: true, force: true });
    fs.renameSync(extracted, fw.dir);
    fs.writeFileSync(fw.stampFile, JSON.stringify(stamp, null, 2) + '\n');
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
}

async function pin(args, pins) {
  for (const fw of pins.frameworks) {
    console.log(`fetch-ios-sdk: downloading ${fw.url}`);
    const sha256 = sha256Of(await download(fw.url));
    pins.pkg.ezoic.iosSdk.frameworks[fw.name].sha256 = sha256;
    console.log(`fetch-ios-sdk: ${fw.name} ${pins.version} sha256 ${sha256}`);
  }
  fs.writeFileSync(args.packageFile, JSON.stringify(pins.pkg, null, 2) + '\n');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const pins = loadPins(args);
  if (args.mode === 'pin') {
    await pin(args, pins);
    return;
  }
  const localDir = args.mode === 'check' ? '' : process.env.EZOIC_IOS_SDK_ZIP_DIR || '';
  if (!localDir) pins.frameworks.forEach(requirePin);

  for (const fw of pins.frameworks) {
    const label = `${fw.name} ${pins.version}`;
    if (args.mode === 'check') {
      if (!isCurrent(fw, pins.version, fw.sha256)) {
        throw new Error(
          `${fw.dir} is missing or not ${label} (${fw.sha256}); run \`node scripts/fetch-ios-sdk.js\` without EZOIC_IOS_SDK_ZIP_DIR`,
        );
      }
      console.log(`fetch-ios-sdk: ${label} present`);
      continue;
    }
    if (!localDir && args.mode !== 'force' && isCurrent(fw, pins.version, fw.sha256)) {
      console.log(`fetch-ios-sdk: ${label} already present`);
      continue;
    }
    const { zip, source, expected } = await obtainZip(fw, localDir);
    const actual = sha256Of(zip);
    if (actual !== expected) {
      throw new Error(`SHA-256 mismatch for ${source}\n  expected ${expected}\n  actual   ${actual}`);
    }
    extract(fw, zip, path.dirname(fw.dir), { version: pins.version, sha256: localDir ? LOCAL : fw.sha256 });
    console.log(`fetch-ios-sdk: extracted ${label}${localDir ? ' (local)' : ''} to ${fw.dir}`);
  }
}

main().catch((error) => {
  console.error(`fetch-ios-sdk: ${error.message}`);
  process.exit(1);
});
