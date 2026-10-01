# Contributing

This guide provides instructions for contributing to the Ezoic Capacitor plugin.

## Developing

### Local Setup

1. Fork and clone the repo.
1. Use Node 24 (`.nvmrc`) and install the dependencies.

   ```shell
   npm ci
   ```

1. For the Android side you need a JDK 21 (Capacitor's Android library targets
   Java 21) and the Android SDK. For the iOS side you need Xcode 26+.
1. Optionally install SwiftLint if you're on macOS.

   ```shell
   brew install swiftlint
   ```

### Scripts

#### `npm run build`

Compiles the TypeScript code from `src/` into ESM JavaScript in `dist/esm/`
(used in apps with bundlers), then bundles it with Rollup into `dist/plugin.js`
and `dist/plugin.cjs.js` (used in apps without bundlers).

#### `npm test` / `npm run typecheck`

Runs the Vitest unit tests (jsdom, against a mock native plugin) and type-checks
the sources and tests.

#### `npm run verify`

Builds and validates the iOS (`xcodebuild`, SPM), Android (`gradlew build test`)
and web (`typecheck` + `test` + `build`) projects. `verify:ios` needs network
access to resolve the Swift packages; `verify:android` resolves
`:capacitor-android` from `node_modules`, so run `npm ci` first.

#### `npm run lint` / `npm run fmt`

Check formatting and code quality with ESLint, Prettier and (if installed)
SwiftLint; `fmt` autoformats/autofixes where possible.

## Publishing

Releases are published to npm by `.github/workflows/publish.yml` using npm
Trusted Publishing (OIDC) when a `vX.Y.Z` tag matching `package.json` is pushed.
Do not publish from a workstation and do not add an `NPM_TOKEN` secret.

> **Note**: The [`files`](https://docs.npmjs.com/cli/v7/configuring-npm/package-json#files)
> array in `package.json` specifies which files get published. If you rename
> files/directories or add files elsewhere, you may need to update it.
