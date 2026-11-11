require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))
framework = 'ios/Frameworks/EzoicCmpSDKBinary.xcframework'

unless File.exist?(File.join(__dir__, framework, 'Info.plist'))
  raise Pod::Informative, "EzoicCapacitorCmpSdk: #{framework} is missing. " \
    'It ships in the npm package; in a git checkout run `npm run fetch:ios` in ' \
    "#{__dir__} to download the Ezoic CMP SDK #{package['version']}"
end

Pod::Spec.new do |s|
  s.name = 'EzoicCapacitorCmpSdk'
  s.version = package['version']
  s.summary = package['description']
  s.license = package['license']
  s.homepage = 'https://github.com/ezoic/capacitor-sdk'
  s.author = package['author']
  s.source = { :git => 'https://github.com/ezoic/capacitor-sdk.git', :tag => "v#{s.version}" }
  s.source_files = 'ios/Sources/**/*.{swift,h,m,c,cc,mm,cpp}'
  s.ios.deployment_target = '15.0'
  s.swift_version = '5.9'
  s.static_framework = true

  s.dependency 'Capacitor'

  # The native CMP (module `EzoicCmpSDKBinary`), the `-cocoapods` XCFramework
  # from the ezoic-swift-sdk-dist GitHub release, bundled in the npm package by
  # scripts/fetch-ios-sdk.js. No other pods. When the app also installs
  # @ezoic/capacitor-sdk, that pod depends on this one for the framework
  # instead of vendoring it again.
  s.vendored_frameworks = framework
end
