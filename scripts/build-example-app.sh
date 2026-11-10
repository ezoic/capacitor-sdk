#!/usr/bin/env bash
# Builds example-app with the packed plugin(s), the way publishers install them
# from npm, and checks that the native CMP is linked exactly once.
#
#   scripts/build-example-app.sh <ads|cmp|both> <android|ios-spm|ios-pods> [workdir]
#
# ads   @ezoic/capacitor-sdk alone
# cmp   @ezoic/capacitor-cmp-sdk alone
# both  both packages (EzoicAds owns the CMP; one copy of each native library)
#
# Packing runs each package's prepack, which needs the pinned iOS frameworks
# (see scripts/fetch-ios-sdk.js; EZOIC_IOS_SDK_ZIP_DIR for unreleased builds).
#
# EZOIC_EXAMPLE_HOOK=<executable>, if set, runs after `cap add` and before the
# build, with the app directory and the platform as arguments, e.g. to point
# the generated app at unreleased native builds.
set -euo pipefail

usage() {
  echo "usage: $0 <ads|cmp|both> <android|ios-spm|ios-pods> [workdir]" >&2
  exit 2
}

[ $# -ge 2 ] || usage
CASE=$1
PLATFORM=$2
case "$CASE" in ads | cmp | both) ;; *) usage ;; esac
case "$PLATFORM" in android | ios-spm | ios-pods) ;; *) usage ;; esac

REPO=$(cd "$(dirname "$0")/.." && pwd)
WORK=${3:-$(mktemp -d)}
mkdir -p "$WORK"
WORK=$(cd "$WORK" && pwd)
APP="$WORK/app"
PACKS="$WORK/packs"
rm -rf "$APP" "$PACKS"
mkdir -p "$PACKS"

# Google's sample app IDs, so the app can launch with the ads SDK.
GAM_APP_ID_IOS='ca-app-pub-3940256099942544~1458002511'
GAM_APP_ID_ANDROID='ca-app-pub-3940256099942544~3347511713'

log() { echo "==> $*"; }

pack() {
  local dir=$1
  (cd "$dir" && npm run build --silent && npm pack --silent --pack-destination "$PACKS" | tail -1)
}

TARBALLS=()
if [ "$CASE" != cmp ]; then
  log "Packing @ezoic/capacitor-sdk"
  TARBALLS+=("$PACKS/$(pack "$REPO")")
fi
if [ "$CASE" != ads ]; then
  log "Packing @ezoic/capacitor-cmp-sdk"
  TARBALLS+=("$PACKS/$(pack "$REPO/cmp")")
fi

log "Creating the app in $APP"
mkdir -p "$APP"
cp -R "$REPO/example-app/." "$APP/"
cd "$APP"
npm install --no-audit --no-fund --silent
npm install --no-audit --no-fund --silent "${TARBALLS[@]}"

case "$PLATFORM" in
  android) npx cap add android ;;
  ios-spm) npx cap add ios --packagemanager SPM ;;
  ios-pods) npx cap add ios --packagemanager CocoaPods ;;
esac

if [ "$CASE" != cmp ]; then
  if [ "$PLATFORM" = android ]; then
    GAM_APP_ID_ANDROID=$GAM_APP_ID_ANDROID perl -0pi -e \
      's#</application>#    <meta-data android:name="com.google.android.gms.ads.APPLICATION_ID" android:value="$ENV{GAM_APP_ID_ANDROID}" />\n    </application>#' \
      android/app/src/main/AndroidManifest.xml
  else
    /usr/libexec/PlistBuddy -c "Add :GADApplicationIdentifier string $GAM_APP_ID_IOS" ios/App/App/Info.plist
  fi
fi

if [ -n "${EZOIC_EXAMPLE_HOOK:-}" ]; then
  log "Running $EZOIC_EXAMPLE_HOOK"
  "$EZOIC_EXAMPLE_HOOK" "$APP" "$PLATFORM"
fi

# Counts the classes / Swift types defined for the CMP's `ConsentOutcome` (used
# by both plugins, so never dead-stripped) and for `EzoicAds` in the build
# output. Two copies of a native SDK would define its types twice.
if [ "$PLATFORM" = android ]; then
  log "Building (assembleDebug)"
  (cd android && ./gradlew --no-daemon assembleDebug)
  apk=android/app/build/outputs/apk/debug/app-debug.apk
  build_tools=$(ls -d "${ANDROID_HOME:?ANDROID_HOME must be set}"/build-tools/* | sort -V | tail -1)
  dex_dir="$WORK/dex"
  rm -rf "$dex_dir" && mkdir -p "$dex_dir"
  unzip -q -o "$apk" 'classes*.dex' -d "$dex_dir"
  copies=$("$build_tools/dexdump" "$dex_dir"/classes*.dex 2>/dev/null |
    grep -c "Class descriptor  : 'Lcom/ezoic/ads/sdk/privacy/cmp/ConsentOutcome;'" || true)
  ads=$("$build_tools/dexdump" "$dex_dir"/classes*.dex 2>/dev/null |
    grep -c "Class descriptor  : 'Lcom/ezoic/ads/sdk/core/EzoicAds;'" || true)
else
  derived="$WORK/DerivedData"
  if [ "$PLATFORM" = ios-pods ]; then
    container=(-workspace ios/App/App.xcworkspace)
  else
    container=(-project ios/App/App.xcodeproj)
  fi
  log "Building (iOS Simulator)"
  xcodebuild build "${container[@]}" -scheme App -configuration Debug \
    -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' \
    -derivedDataPath "$derived" -skipPackagePluginValidation \
    COMPILER_INDEX_STORE_ENABLE=NO CODE_SIGNING_ALLOWED=NO -quiet
  app_bundle="$derived/Build/Products/Debug-iphonesimulator/App.app"
  binaries=("$app_bundle/App")
  [ -f "$app_bundle/App.debug.dylib" ] && binaries+=("$app_bundle/App.debug.dylib")
  count_type() {
    for binary in "${binaries[@]}"; do nm -U "$binary"; done | awk '{print $3}' |
      xcrun swift-demangle | grep -c "^nominal type descriptor for $1\$" || true
  }
  copies=$(count_type 'EzoicCmpSDKBinary.ConsentOutcome')
  ads=$(count_type 'EzoicAdsSDKBinary.EzoicAds')
  # The Ezoic frameworks are static and linked into the app binary. (Xcode
  # embeds an inert stub for an SPM static binary target; nothing loads it.)
  if otool -L "${binaries[@]}" | grep -q 'Ezoic.*SDKBinary'; then
    echo "error: the app loads an Ezoic framework dynamically" >&2
    exit 1
  fi
fi

expected_ads=1
[ "$CASE" = cmp ] && expected_ads=0
echo "ConsentOutcome definitions: $copies (expected 1); EzoicAds definitions: $ads (expected $expected_ads)"
if [ "$copies" != 1 ] || [ "$ads" != "$expected_ads" ]; then
  echo "error: unexpected number of native SDK copies" >&2
  exit 1
fi
log "OK: $CASE on $PLATFORM ($WORK)"
