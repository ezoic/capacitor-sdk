# Example app

A minimal Capacitor app for `@ezoic/capacitor-sdk` and
`@ezoic/capacitor-cmp-sdk`. The page (`www/index.html`) calls the raw
`EzoicAds` / `EzoicCmp` plugins, so it needs no bundler and works with either
package installed, or both.

Native projects aren't checked in. `scripts/build-example-app.sh` generates
them. It packs the package(s) the way npm would, installs them into a copy of
this app, adds the platform and builds it:

```sh
scripts/build-example-app.sh ads android    # @ezoic/capacitor-sdk alone
scripts/build-example-app.sh cmp ios-spm    # @ezoic/capacitor-cmp-sdk alone
scripts/build-example-app.sh both ios-pods  # both together
```

The build output must define the native CMP exactly once (and the ads SDK once
unless the case is `cmp`); the script fails otherwise. CI runs every case on
every platform.

To run an app after a build, open the generated project from the work
directory the script prints: `app/android` in Android Studio, or
`app/ios/App` in Xcode. On Android, `npx cap run android` from `app/` also
works. The app uses Google's sample Ad Manager app ID.
