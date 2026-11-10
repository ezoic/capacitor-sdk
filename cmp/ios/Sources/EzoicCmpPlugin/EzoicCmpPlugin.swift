import Foundation
import UIKit
import Capacitor
#if canImport(EzoicCmpSDK)
import EzoicCmpSDK
#else
import EzoicCmpSDKBinary
#endif

/// Capacitor bridge for the standalone Ezoic CMP (`EzoicCmp`).
///
/// Capacitor invokes plugin methods off the main thread, while the consent UI
/// must be driven from main, so every method hops to main via `onMain`. The
/// outcome objects match `@ezoic/capacitor-sdk`'s.
@objc(EzoicCmpPlugin)
public class EzoicCmpPlugin: CAPPlugin, CAPBridgedPlugin {
  public let identifier = "EzoicCmpPlugin"
  public let jsName = "EzoicCmp"
  public let pluginMethods: [CAPPluginMethod] = [
    CAPPluginMethod(name: "initialize", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "presentConsentIfRequired", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "presentConsentSettings", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "isConsentRequired", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "isPrivacyOptionsRequired", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "resetConsent", returnType: CAPPluginReturnPromise),
  ]

  private static let pluginErrorCode = "EzoicCmp"
  private static let noHostCode = -1
  private static let noHostMessage = "No foreground Activity"

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

  @objc func initialize(_ call: CAPPluginCall) {
    guard let domain = call.getString("domain"), !domain.isEmpty else {
      call.reject("initialize requires a non-empty `domain`.", Self.pluginErrorCode)
      return
    }
    let debug = call.getBool("debugEnabled") ?? false
    let configuration = EzoicCmpConfiguration(
      cmpEnabled: call.getBool("cmpEnabled") ?? true,
      autoReadConsent: call.getBool("autoReadConsent") ?? true,
      debugEnabled: debug
    )
    let autoPresentConsent = call.getBool("autoPresentConsent") ?? true
    onMain { [weak self] in
      // Returns at once (the settings load in the background); repeat calls
      // are logged and ignored natively.
      EzoicCmp.initialize(domain: domain, configuration: configuration)
      call.resolve()
      if autoPresentConsent { self?.presentConsentAfterInit(debug: debug) }
    }
  }

  /// Presents the consent dialog once after `initialize`. Native waits for the
  /// settings and returns `.notRequired` where there is nothing to ask, so this
  /// is a no-op there. The outcome is only logged.
  private func presentConsentAfterInit(debug: Bool) {
    guard let host = hostViewController() else {
      if debug { NSLog("[EzoicCapacitorCmpSdk] autoPresentConsent skipped: no foreground view controller") }
      return
    }
    EzoicCmp.presentConsentIfRequired(from: host) { outcome in
      if debug { NSLog("[EzoicCapacitorCmpSdk] autoPresentConsent outcome: %@", String(describing: outcome)) }
    }
  }

  @objc func presentConsentIfRequired(_ call: CAPPluginCall) {
    presentConsent(call) { host, completion in
      EzoicCmp.presentConsentIfRequired(from: host, completion: completion)
    }
  }

  @objc func presentConsentSettings(_ call: CAPPluginCall) {
    presentConsent(call) { host, completion in
      EzoicCmp.presentConsentSettings(from: host, completion: completion)
    }
  }

  @objc func isConsentRequired(_ call: CAPPluginCall) {
    onMain { call.resolve(Self.requiredResult(EzoicCmp.isConsentRequired)) }
  }

  @objc func isPrivacyOptionsRequired(_ call: CAPPluginCall) {
    onMain { call.resolve(Self.requiredResult(EzoicCmp.isPrivacyOptionsRequired)) }
  }

  @objc func resetConsent(_ call: CAPPluginCall) {
    onMain {
      EzoicCmp.resetConsent()
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

  private static func requiredResult(_ required: Bool?) -> [String: Any] {
    if let required = required { return ["required": required] }
    return ["required": NSNull()]
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
      let code = (error as? EzoicErrorCode)?.code ?? -1
      let message = error.localizedDescription.isEmpty ? "Unknown error" : error.localizedDescription
      return consentFailure(code: code, message: message)
    @unknown default:
      return consentFailure(code: -1, message: "Unrecognized outcome")
    }
  }
}
