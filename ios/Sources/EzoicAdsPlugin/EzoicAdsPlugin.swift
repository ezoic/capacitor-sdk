import Foundation
import UIKit
import Capacitor
#if canImport(EzoicAdsSDK)
import EzoicAdsSDK
#else
import EzoicAdsSDKBinary
#endif

/// Capacitor bridge for the Ezoic Ads SDK.
///
/// Capacitor invokes plugin methods off the main thread, while the native SDK
/// (and the overlay views) must be driven from main, so every method hops to
/// main via `onMain`. Holding a `CAPPluginCall` across that hop and settling
/// it later is fine — Capacitor keeps the call alive until it is resolved or
/// rejected.
///
/// Events: `adViewEvent` (`{id, type, ...}`), `rewardedAdEvent` and
/// `interstitialAdEvent` (`{adUnitIdentifier, type, ...}`).
@objc(EzoicAdsPlugin)
public class EzoicAdsPlugin: CAPPlugin, CAPBridgedPlugin {
  public let identifier = "EzoicAdsPlugin"
  public let jsName = "EzoicAds"
  public let pluginMethods: [CAPPluginMethod] = [
    CAPPluginMethod(name: "initialize", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "trackPageview", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "setGDPRConsent", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "setGPPConsent", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "setSubjectToCOPPA", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "presentConsentIfRequired", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "presentConsentSettings", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "isConsentRequired", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "resetConsent", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "createAdView", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "loadAdView", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "showAdView", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "hideAdView", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "setAdViewPlacement", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "destroyAdView", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "loadRewardedAd", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "showRewardedAd", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "destroyRewardedAd", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "loadInterstitialAd", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "showInterstitialAd", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "destroyInterstitialAd", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "loadInstreamAd", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "getInstreamNextAdTagUrl", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "reportInstreamImpression", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "destroyInstreamAd", returnType: CAPPluginReturnPromise),
  ]

  private static let adViewEvent = "adViewEvent"
  private static let rewardedEvent = "rewardedAdEvent"
  private static let interstitialEvent = "interstitialAdEvent"
  private static let noHostCode = -1
  private static let noHostMessage = "No foreground Activity"

  private var adViews: EzoicAdViewManager!
  private var fullScreen: EzoicFullScreenAdManager!

  override public func load() {
    adViews = EzoicAdViewManager(
      webViewProvider: { [weak self] in self?.bridge?.webView },
      emit: { [weak self] payload in self?.notifyListeners(Self.adViewEvent, data: payload, retainUntilConsumed: true) }
    )
    fullScreen = EzoicFullScreenAdManager(
      emitRewarded: { [weak self] payload in self?.notifyListeners(Self.rewardedEvent, data: payload, retainUntilConsumed: true) },
      emitInterstitial: { [weak self] payload in self?.notifyListeners(Self.interstitialEvent, data: payload, retainUntilConsumed: true) }
    )
  }

  deinit {
    let adViews = self.adViews
    let fullScreen = self.fullScreen
    DispatchQueue.main.async {
      adViews?.destroyAll()
      fullScreen?.destroyAll()
    }
  }

  private func onMain(_ work: @escaping () -> Void) {
    if Thread.isMainThread { work() } else { DispatchQueue.main.async(execute: work) }
  }

  /// The view controller consent dialogs are presented from: the top-most
  /// presented controller above the Capacitor bridge controller.
  private func hostViewController() -> UIViewController? {
    var top: UIViewController? = bridge?.viewController
    if top == nil {
      top = UIApplication.shared.connectedScenes
        .compactMap { $0 as? UIWindowScene }
        .flatMap { $0.windows }
        .first { $0.isKeyWindow }?
        .rootViewController
    }
    while let presented = top?.presentedViewController { top = presented }
    return top
  }

  // MARK: - Lifecycle

  @objc func initialize(_ call: CAPPluginCall) {
    guard let domain = call.getString("domain"), !domain.isEmpty else {
      call.rejectPlugin("initialize requires a non-empty `domain`.")
      return
    }
    let configuration = EzoicConfiguration(
      domain: domain,
      autoReadConsent: call.getBool("autoReadConsent") ?? true,
      subjectToCOPPA: call.getBool("subjectToCOPPA") ?? false,
      requestATTBeforeAds: call.getBool("requestATTBeforeAds") ?? true,
      debugEnabled: call.getBool("debugEnabled") ?? false,
      testMode: call.getBool("testMode") ?? false,
      autoTrackPageviews: call.getBool("autoTrackPageviews") ?? true,
      cmpEnabled: call.getBool("cmpEnabled") ?? true
    )
    let autoPresentConsent = call.getBool("autoPresentConsent") ?? true
    onMain { [weak self] in
      EzoicAds.shared.initialize(with: configuration) { result in
        switch result {
        case .success:
          call.resolve()
          if autoPresentConsent { self?.presentConsentAfterInit(debug: configuration.debugEnabled) }
        case .failure(let error):
          call.rejectEzoic(error, fallback: "Ezoic initialization failed")
        }
      }
    }
  }

  /// Presents the consent dialog once after a successful `initialize`. Native
  /// returns `.notRequired` outside GDPR / with `cmpEnabled: false` / with
  /// another CMP or manual consent, so this is a no-op there. The outcome is
  /// only logged; publishers wanting it call `presentConsentIfRequired`.
  private func presentConsentAfterInit(debug: Bool) {
    onMain { [weak self] in
      guard let host = self?.hostViewController() else {
        if debug { NSLog("[EzoicCapacitorSdk] autoPresentConsent skipped: no foreground view controller") }
        return
      }
      EzoicAds.shared.presentConsentIfRequired(from: host) { outcome in
        if debug { NSLog("[EzoicCapacitorSdk] autoPresentConsent outcome: %@", String(describing: outcome)) }
      }
    }
  }

  @objc func trackPageview(_ call: CAPPluginCall) {
    let screen = call.getString("screen")
    onMain {
      let completion: (Bool) -> Void = { tracked in call.resolve(["tracked": tracked]) }
      if let screen = screen, !screen.isEmpty {
        EzoicAds.shared.trackPageview(screen: screen, completion: completion)
      } else {
        EzoicAds.shared.trackPageview(completion: completion)
      }
    }
  }

  // MARK: - Privacy

  @objc func setGDPRConsent(_ call: CAPPluginCall) {
    guard let applies = call.getBool("applies") else {
      call.rejectPlugin("setGDPRConsent requires `applies`.")
      return
    }
    let consentString = call.getString("consentString")
    onMain {
      EzoicAds.shared.setGDPRConsent(applies: applies, consentString: consentString)
      call.resolve()
    }
  }

  @objc func setGPPConsent(_ call: CAPPluginCall) {
    let gppString = call.getString("gppString")
    let sectionIds = call.getString("sectionIds")
    onMain {
      EzoicAds.shared.setGPPConsent(gppString: gppString, sectionIds: sectionIds)
      call.resolve()
    }
  }

  @objc func setSubjectToCOPPA(_ call: CAPPluginCall) {
    guard let value = call.getBool("value") else {
      call.rejectPlugin("setSubjectToCOPPA requires `value`.")
      return
    }
    onMain {
      EzoicAds.shared.setSubjectToCOPPA(value)
      call.resolve()
    }
  }

  // MARK: - Consent (built-in CMP)

  @objc func presentConsentIfRequired(_ call: CAPPluginCall) {
    presentConsent(call) { host, completion in
      EzoicAds.shared.presentConsentIfRequired(from: host, completion: completion)
    }
  }

  @objc func presentConsentSettings(_ call: CAPPluginCall) {
    presentConsent(call) { host, completion in
      EzoicAds.shared.presentConsentSettings(from: host, completion: completion)
    }
  }

  @objc func isConsentRequired(_ call: CAPPluginCall) {
    onMain {
      if let required = EzoicAds.shared.isConsentRequired {
        call.resolve(["required": required])
      } else {
        call.resolve(["required": NSNull()])
      }
    }
  }

  @objc func resetConsent(_ call: CAPPluginCall) {
    onMain {
      EzoicAds.shared.resetConsent()
      call.resolve()
    }
  }

  /// Presents from the top-most view controller on main and always resolves
  /// with an outcome object; with no view controller it resolves `failed(-1)`.
  private func presentConsent(
    _ call: CAPPluginCall,
    _ present: @escaping (UIViewController, @escaping (ConsentOutcome) -> Void) -> Void
  ) {
    onMain { [weak self] in
      guard let host = self?.hostViewController() else {
        call.resolve(Self.consentFailure(code: Self.noHostCode, message: Self.noHostMessage))
        return
      }
      present(host) { outcome in call.resolve(Self.consentOutcomeMap(outcome)) }
    }
  }

  private static func consentFailure(code: Int, message: String) -> [String: Any] {
    return ["type": "failed", "code": code, "message": message]
  }

  private static func consentOutcomeMap(_ outcome: ConsentOutcome) -> [String: Any] {
    switch outcome {
    case .notRequired:
      return ["type": "notRequired"]
    case .alreadyDecided:
      return ["type": "alreadyDecided"]
    case .dismissed:
      return ["type": "dismissed"]
    case .alreadyPresenting:
      return ["type": "alreadyPresenting"]
    case .decided(let decision):
      let name: String
      switch decision {
      case .acceptAll: name = "acceptAll"
      case .rejectAll: name = "rejectAll"
      case .custom: name = "custom"
      @unknown default: return consentFailure(code: -1, message: "Unrecognized outcome")
      }
      return ["type": "decided", "decision": name]
    case .failed(let error):
      return consentFailure(code: error.code, message: error.localizedDescription)
    @unknown default:
      return consentFailure(code: -1, message: "Unrecognized outcome")
    }
  }

  // MARK: - Ad views (banner / native / outstream overlays)

  @objc func createAdView(_ call: CAPPluginCall) {
    guard let id = call.getString("id"), !id.isEmpty,
          let adUnitIdentifier = call.getString("adUnitIdentifier"), !adUnitIdentifier.isEmpty else {
      call.rejectPlugin("createAdView requires `id` and `adUnitIdentifier`.")
      return
    }
    guard let kind = EzoicAdViewKind(rawValue: call.getString("kind") ?? "") else {
      call.rejectPlugin("Unknown ad view kind: \(call.getString("kind") ?? "")")
      return
    }
    let placement: EzoicPlacement
    do {
      placement = try EzoicPlacement.parse(call.getObject("placement"))
    } catch {
      call.rejectPlugin(error.localizedDescription)
      return
    }
    let sizes = (call.getArray("size", String.self) ?? [])
      .map { $0.trimmingCharacters(in: .whitespaces) }
      .filter { !$0.isEmpty }
    let collapseOnNoFill = call.getBool("collapseOnNoFill") ?? true
    onMain { [weak self] in
      guard let self = self else { return }
      do {
        try self.adViews.create(id: id, kind: kind, rawAdUnitId: adUnitIdentifier, sizes: sizes, collapseOnNoFill: collapseOnNoFill, placement: placement)
        call.resolve()
      } catch {
        call.rejectPlugin(error.localizedDescription)
      }
    }
  }

  @objc func loadAdView(_ call: CAPPluginCall) {
    withAdView(call) { try self.adViews.load(id: $0) }
  }

  @objc func showAdView(_ call: CAPPluginCall) {
    withAdView(call) { try self.adViews.show(id: $0) }
  }

  @objc func hideAdView(_ call: CAPPluginCall) {
    withAdView(call) { try self.adViews.hide(id: $0) }
  }

  @objc func setAdViewPlacement(_ call: CAPPluginCall) {
    let placement: EzoicPlacement
    do {
      placement = try EzoicPlacement.parse(call.getObject("placement"))
    } catch {
      call.rejectPlugin(error.localizedDescription)
      return
    }
    withAdView(call) { try self.adViews.setPlacement(id: $0, placement: placement) }
  }

  @objc func destroyAdView(_ call: CAPPluginCall) {
    withAdView(call) { self.adViews.destroy(id: $0) }
  }

  private func withAdView(_ call: CAPPluginCall, _ block: @escaping (String) throws -> Void) {
    guard let id = call.getString("id"), !id.isEmpty else {
      call.rejectPlugin("Missing ad view `id`.")
      return
    }
    onMain {
      do {
        try block(id)
        call.resolve()
      } catch {
        call.rejectPlugin(error.localizedDescription)
      }
    }
  }

  // MARK: - Rewarded

  @objc func loadRewardedAd(_ call: CAPPluginCall) {
    guard let id = requireAdUnit(call) else { return }
    onMain { [weak self] in self?.fullScreen.loadRewarded(id, call: call) }
  }

  @objc func showRewardedAd(_ call: CAPPluginCall) {
    guard let id = requireAdUnit(call) else { return }
    let rewardName = call.getString("rewardName")
    onMain { [weak self] in self?.fullScreen.showRewarded(id, rewardName: rewardName, call: call) }
  }

  @objc func destroyRewardedAd(_ call: CAPPluginCall) {
    guard let id = requireAdUnit(call) else { return }
    onMain { [weak self] in
      self?.fullScreen.destroyRewarded(id)
      call.resolve()
    }
  }

  // MARK: - Interstitial

  @objc func loadInterstitialAd(_ call: CAPPluginCall) {
    guard let id = requireAdUnit(call) else { return }
    onMain { [weak self] in self?.fullScreen.loadInterstitial(id, call: call) }
  }

  @objc func showInterstitialAd(_ call: CAPPluginCall) {
    guard let id = requireAdUnit(call) else { return }
    onMain { [weak self] in self?.fullScreen.showInterstitial(id, call: call) }
  }

  @objc func destroyInterstitialAd(_ call: CAPPluginCall) {
    guard let id = requireAdUnit(call) else { return }
    onMain { [weak self] in
      self?.fullScreen.destroyInterstitial(id)
      call.resolve()
    }
  }

  // MARK: - Instream

  @objc func loadInstreamAd(_ call: CAPPluginCall) {
    guard let id = requireNumericAdUnit(call) else { return }
    let contentUrl = call.getString("contentUrl")
    onMain { [weak self] in self?.fullScreen.loadInstream(id, contentUrl: contentUrl, call: call) }
  }

  @objc func getInstreamNextAdTagUrl(_ call: CAPPluginCall) {
    guard let id = requireNumericAdUnit(call) else { return }
    onMain { [weak self] in
      if let url = self?.fullScreen.instreamNextAdTagUrl(id) {
        call.resolve(["adTagUrl": url])
      } else {
        call.resolve(["adTagUrl": NSNull()])
      }
    }
  }

  @objc func reportInstreamImpression(_ call: CAPPluginCall) {
    guard let id = requireNumericAdUnit(call) else { return }
    let revenueUsd = call.getDouble("revenueUsd")
    onMain { [weak self] in
      self?.fullScreen.reportInstreamImpression(id, revenueUsd: revenueUsd)
      call.resolve()
    }
  }

  @objc func destroyInstreamAd(_ call: CAPPluginCall) {
    guard let id = requireNumericAdUnit(call) else { return }
    onMain { [weak self] in
      self?.fullScreen.destroyInstream(id)
      call.resolve()
    }
  }

  // MARK: - Helpers

  private func requireAdUnit(_ call: CAPPluginCall) -> String? {
    guard let id = call.getString("adUnitIdentifier"), !id.isEmpty else {
      call.rejectPlugin("Missing `adUnitIdentifier`.")
      return nil
    }
    return id
  }

  /// Instream ids arrive as JS numbers (accept numeric strings too). Rejects
  /// NaN / infinite / out-of-range values before the `Int(...)` conversion,
  /// which would otherwise trap. Requires >= 1 to match Android.
  private func requireNumericAdUnit(_ call: CAPPluginCall) -> Int? {
    let value: Double?
    if let number = call.getDouble("adUnitIdentifier") {
      value = number
    } else if let string = call.getString("adUnitIdentifier") {
      value = Double(string)
    } else {
      value = nil
    }
    guard let raw = value, raw.isFinite, raw >= 1, raw <= Double(Int32.max) else {
      call.rejectPlugin("Invalid `adUnitIdentifier`.")
      return nil
    }
    return Int(raw)
  }
}
