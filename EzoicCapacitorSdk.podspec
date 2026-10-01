require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

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
  # Native Ezoic Ads SDK (vends the `EzoicAdsSDKBinary` module). Brings in
  # PrebidMobile + Google-Mobile-Ads-SDK transitively.
  s.dependency 'EzoicAdsSDK', '~> 1.13.1'
  # The native-ad template imports GoogleMobileAds directly (NativeAdView,
  # MediaView, NativeAd). Pin GMA 12 so the module is on the compile path.
  s.dependency 'Google-Mobile-Ads-SDK', '~> 12.0'
end
