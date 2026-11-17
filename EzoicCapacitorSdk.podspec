require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))
ios_sdk = package['ezoic']['iosSdk']
frameworks_dir = 'ios/Frameworks'
cmp_pod = 'EzoicCapacitorCmpSdk'

# An app that also installs @ezoic/capacitor-cmp-sdk gets EzoicCmpSDKBinary
# from that pod: vendoring it here as well would link it twice (CocoaPods
# fails with "frameworks with conflicting names"). Capacitor writes every
# plugin into the app's Podfile, so the Podfile says whether it is there.
cmp_pod_in_podfile = begin
  podfile = Pod::Config.instance.podfile
  !podfile.nil? && podfile.dependencies.any? { |dependency| dependency.root_name == cmp_pod }
rescue StandardError
  false
end

vendored = ['EzoicAdsSDKBinary']
vendored << 'EzoicCmpSDKBinary' unless cmp_pod_in_podfile
vendored.each do |name|
  next if File.exist?(File.join(__dir__, frameworks_dir, "#{name}.xcframework", 'Info.plist'))

  raise Pod::Informative, "EzoicCapacitorSdk: #{frameworks_dir}/#{name}.xcframework is missing. " \
    'It ships in the npm package; in a git checkout run `npm run fetch:ios` in ' \
    "#{__dir__} to download Ezoic iOS SDK #{ios_sdk['version']}"
end

Pod::Spec.new do |s|
  s.name = 'EzoicCapacitorSdk'
  s.version = package['version']
  s.summary = package['description']
  s.license = package['license']
  s.homepage = package['repository']['url']
  s.author = package['author']
  s.source = { :git => package['repository']['url'], :tag => "v#{s.version}" }
  s.source_files = 'ios/Sources/**/*.{swift,h,m,c,cc,mm,cpp}'
  s.ios.deployment_target = '15.0'
  s.swift_version = '5.9'

  # The Ezoic / Prebid / GMA frameworks must be linked statically. Capacitor
  # apps use `use_frameworks!` in their Podfile; this flag makes the pod build
  # as a static framework regardless, so publishers do not have to switch
  # their Podfile to `:linkage => :static`.
  s.static_framework = true

  s.dependency 'Capacitor'

  # Native Ezoic iOS SDK, the `-cocoapods` XCFrameworks from the
  # ezoic-swift-sdk-dist GitHub release, bundled in the npm package by
  # scripts/fetch-ios-sdk.js (CocoaPods trunk is frozen). Modules
  # `EzoicAdsSDKBinary` and `EzoicCmpSDKBinary`, which the ads binary
  # re-exports. Static archives that link the host's PrebidMobile /
  # GoogleMobileAds / DTBiOSSDK rather than embedding them.
  s.vendored_frameworks = vendored.map { |name| "#{frameworks_dir}/#{name}.xcframework" }
  s.dependency cmp_pod, s.version.to_s if cmp_pod_in_podfile

  # From package.json `ezoic.iosSdk.podDependencies`, the pods the binaries
  # were built against (PrebidMobile's Swift ABI is exact). The native-ad
  # template also imports GoogleMobileAds directly.
  ios_sdk['podDependencies'].each do |name, requirement|
    s.dependency name, requirement
  end
end
