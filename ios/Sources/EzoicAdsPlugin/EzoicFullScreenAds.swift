import Foundation
import UIKit
import Capacitor
#if canImport(EzoicAdsSDK)
import EzoicAdsSDK
#else
import EzoicAdsSDKBinary
#endif

/// Rewarded, interstitial and instream ads, keyed by ad unit id. Mirrors the
/// React Native implementation: a loaded ad waits in a dictionary until
/// `show`, whose call is settled from the delegate (dismiss = resolve,
/// failed-to-present = reject). Every method runs on the main thread (the
/// plugin dispatches there); the native SDK delivers delegate callbacks on
/// main as well.
final class EzoicFullScreenAdManager: NSObject {
  private final class PendingRewardShow {
    let call: CAPPluginCall
    var reward: EzoicReward?
    var settled = false
    init(call: CAPPluginCall) { self.call = call }
  }

  private final class PendingCall {
    let call: CAPPluginCall
    var settled = false
    init(call: CAPPluginCall) { self.call = call }
  }

  private let emitRewarded: ([String: Any]) -> Void
  private let emitInterstitial: ([String: Any]) -> Void

  private var rewardedAds: [Int: EzoicRewardedAd] = [:]
  private var pendingRewardShows: [Int: PendingRewardShow] = [:]
  private var loadingRewarded: Set<Int> = []

  private var interstitialAds: [Int: EzoicInterstitialAd] = [:]
  private var pendingInterstitialShows: [Int: PendingCall] = [:]
  private var loadingInterstitial: Set<Int> = []

  /// Instream is multi-use and NOT auto-destroying, so each controller is
  /// retained across load cycles until `destroyInstream` or teardown.
  private var instreamAds: [Int: EzoicInstreamAd] = [:]

  /// In-flight instream loads. Doubles as the duplicate-load guard: the
  /// native `load` is a SILENT no-op while already loading, so an overlapping
  /// load must be rejected here or its call hangs forever.
  private var pendingInstreamLoads: [Int: PendingCall] = [:]

  init(emitRewarded: @escaping ([String: Any]) -> Void, emitInterstitial: @escaping ([String: Any]) -> Void) {
    self.emitRewarded = emitRewarded
    self.emitInterstitial = emitInterstitial
  }

  // MARK: - Rewarded

  func loadRewarded(_ rawId: String, call: CAPPluginCall) {
    guard let id = Int(rawId), id > 0 else {
      call.rejectPlugin("Invalid adUnitIdentifier: \(rawId)")
      return
    }
    if rewardedAds[id] != nil || loadingRewarded.contains(id) {
      call.rejectPlugin("An ad is already loaded/loading for ad unit \(rawId)")
      return
    }
    loadingRewarded.insert(id)
    EzoicRewardedAd.load(adUnitIdentifier: id) { [weak self] result in
      guard let self = self else { return }
      self.loadingRewarded.remove(id)
      switch result {
      case .success(let ad):
        ad.delegate = self
        self.rewardedAds[id] = ad
        call.resolve()
      case .failure(let error):
        call.rejectEzoic(error, fallback: "Rewarded ad failed to load")
      }
    }
  }

  func showRewarded(_ rawId: String, rewardName: String?, call: CAPPluginCall) {
    guard let id = Int(rawId), let ad = rewardedAds[id] else {
      call.rejectPlugin("Rewarded ad not loaded for \(rawId)")
      return
    }
    if pendingRewardShows[id] != nil {
      call.rejectPlugin("A show is already in progress for ad unit \(rawId)")
      return
    }
    let pending = PendingRewardShow(call: call)
    pendingRewardShows[id] = pending
    // Presenting from nil lets GMA use the application's top view controller.
    ad.show(from: nil, rewardName: rewardName) { reward in
      pending.reward = reward
    }
  }

  /// Releases a loaded-but-unshown rewarded ad so the unit can be loaded again.
  func destroyRewarded(_ rawId: String) {
    guard let id = Int(rawId), pendingRewardShows[id] == nil else { return }
    if let ad = rewardedAds.removeValue(forKey: id) {
      ad.delegate = nil
      ad.destroy()
    }
  }

  private func emitRewardedEvent(_ ad: EzoicRewardedAd, _ type: String, _ extra: [String: Any] = [:]) {
    var body: [String: Any] = ["adUnitIdentifier": String(ad.adUnitIdentifier), "type": type]
    for (key, value) in extra { body[key] = value }
    emitRewarded(body)
  }

  // MARK: - Interstitial

  func loadInterstitial(_ rawId: String, call: CAPPluginCall) {
    guard let id = Int(rawId), id > 0 else {
      call.rejectPlugin("Invalid adUnitIdentifier: \(rawId)")
      return
    }
    if interstitialAds[id] != nil || loadingInterstitial.contains(id) {
      call.rejectPlugin("An ad is already loaded/loading for ad unit \(rawId)")
      return
    }
    loadingInterstitial.insert(id)
    EzoicInterstitialAd.load(adUnitIdentifier: id) { [weak self] result in
      guard let self = self else { return }
      self.loadingInterstitial.remove(id)
      switch result {
      case .success(let ad):
        ad.delegate = self
        self.interstitialAds[id] = ad
        call.resolve()
      case .failure(let error):
        call.rejectEzoic(error, fallback: "Interstitial ad failed to load")
      }
    }
  }

  func showInterstitial(_ rawId: String, call: CAPPluginCall) {
    guard let id = Int(rawId), let ad = interstitialAds[id] else {
      call.rejectPlugin("Interstitial ad not loaded for \(rawId)")
      return
    }
    if pendingInterstitialShows[id] != nil {
      call.rejectPlugin("A show is already in progress for ad unit \(rawId)")
      return
    }
    pendingInterstitialShows[id] = PendingCall(call: call)
    ad.show(from: nil)
  }

  /// Releases a loaded-but-unshown interstitial so the unit can be loaded again.
  func destroyInterstitial(_ rawId: String) {
    guard let id = Int(rawId), pendingInterstitialShows[id] == nil else { return }
    if let ad = interstitialAds.removeValue(forKey: id) {
      ad.delegate = nil
      ad.destroy()
    }
  }

  private func emitInterstitialEvent(_ ad: EzoicInterstitialAd, _ type: String, _ extra: [String: Any] = [:]) {
    var body: [String: Any] = ["adUnitIdentifier": String(ad.adUnitIdentifier), "type": type]
    for (key, value) in extra { body[key] = value }
    emitInterstitial(body)
  }

  // MARK: - Instream

  func loadInstream(_ id: Int, contentUrl: String?, call: CAPPluginCall) {
    if pendingInstreamLoads[id] != nil {
      call.rejectPlugin("An instream ad is already loading for ad unit \(id)")
      return
    }
    // Create-or-reuse: a repeat load on the same id reuses the existing native
    // controller (preserving its tag state).
    let ad: EzoicInstreamAd
    if let existing = instreamAds[id] {
      ad = existing
    } else {
      ad = EzoicInstreamAd(adUnitId: id)
      instreamAds[id] = ad
    }
    // Register the pending holder BEFORE calling load: early validation
    // failures deliver the delegate callback synchronously.
    pendingInstreamLoads[id] = PendingCall(call: call)
    ad.load(contentUrl: contentUrl, delegate: self)
  }

  /// The next waterfall tag, or nil when exhausted / before a load / after destroy.
  func instreamNextAdTagUrl(_ id: Int) -> String? {
    return instreamAds[id]?.getNextAdTagUrl()
  }

  func reportInstreamImpression(_ id: Int, revenueUsd: Double?) {
    instreamAds[id]?.reportImpression(revenueUsd: revenueUsd)
  }

  func destroyInstream(_ id: Int) {
    // Native suppresses load callbacks once destroyed, so settle any pending
    // load's call here first or it hangs forever.
    if let pending = pendingInstreamLoads.removeValue(forKey: id), !pending.settled {
      pending.settled = true
      pending.call.rejectPlugin("Instream ad was destroyed while loading")
    }
    instreamAds.removeValue(forKey: id)?.destroy()
  }

  // MARK: - Teardown

  func destroyAll() {
    for (_, pending) in pendingRewardShows where !pending.settled {
      pending.settled = true
      pending.call.rejectPlugin("Plugin was destroyed while showing")
    }
    pendingRewardShows.removeAll()
    for (_, ad) in rewardedAds {
      ad.delegate = nil
      ad.destroy()
    }
    rewardedAds.removeAll()

    for (_, pending) in pendingInterstitialShows where !pending.settled {
      pending.settled = true
      pending.call.rejectPlugin("Plugin was destroyed while showing")
    }
    pendingInterstitialShows.removeAll()
    for (_, ad) in interstitialAds {
      ad.delegate = nil
      ad.destroy()
    }
    interstitialAds.removeAll()

    for (_, pending) in pendingInstreamLoads where !pending.settled {
      pending.settled = true
      pending.call.rejectPlugin("Plugin was destroyed while loading")
    }
    pendingInstreamLoads.removeAll()
    for (_, ad) in instreamAds { ad.destroy() }
    instreamAds.removeAll()
  }
}

// MARK: - EzoicRewardedAdDelegate

extension EzoicFullScreenAdManager: EzoicRewardedAdDelegate {
  func rewardedAdDidPresent(_ rewardedAd: EzoicRewardedAd) {
    emitRewardedEvent(rewardedAd, "shown")
  }

  func rewardedAd(_ rewardedAd: EzoicRewardedAd, didFailToPresentWithError error: EzoicError) {
    emitRewardedEvent(rewardedAd, "failedToShow", ["message": error.localizedDescription, "code": error.code])
    let id = rewardedAd.adUnitIdentifier
    rewardedAds.removeValue(forKey: id)
    if let pending = pendingRewardShows.removeValue(forKey: id), !pending.settled {
      pending.settled = true
      pending.call.rejectEzoic(error, fallback: "Rewarded ad failed to show")
    }
  }

  func rewardedAdDidRecordImpression(_ rewardedAd: EzoicRewardedAd) {
    emitRewardedEvent(rewardedAd, "impression")
  }

  func rewardedAdDidRecordClick(_ rewardedAd: EzoicRewardedAd) {
    emitRewardedEvent(rewardedAd, "clicked")
  }

  func rewardedAd(_ rewardedAd: EzoicRewardedAd, userDidEarn reward: EzoicReward) {
    emitRewardedEvent(rewardedAd, "reward", ["rewardType": reward.type, "rewardAmount": reward.amount])
    pendingRewardShows[rewardedAd.adUnitIdentifier]?.reward = reward
  }

  func rewardedAdDidDismiss(_ rewardedAd: EzoicRewardedAd) {
    emitRewardedEvent(rewardedAd, "dismissed")
    let id = rewardedAd.adUnitIdentifier
    rewardedAds.removeValue(forKey: id)
    if let pending = pendingRewardShows.removeValue(forKey: id), !pending.settled {
      pending.settled = true
      let reward = pending.reward
      pending.call.resolve([
        "earned": reward != nil,
        "type": reward?.type ?? "",
        "amount": reward?.amount ?? 0,
      ])
    }
  }
}

// MARK: - EzoicInterstitialAdDelegate

extension EzoicFullScreenAdManager: EzoicInterstitialAdDelegate {
  func interstitialAdDidPresent(_ interstitialAd: EzoicInterstitialAd) {
    emitInterstitialEvent(interstitialAd, "shown")
  }

  func interstitialAd(_ interstitialAd: EzoicInterstitialAd, didFailToPresentWithError error: EzoicError) {
    emitInterstitialEvent(interstitialAd, "failedToShow", ["message": error.localizedDescription, "code": error.code])
    let id = interstitialAd.adUnitIdentifier
    interstitialAds.removeValue(forKey: id)
    if let pending = pendingInterstitialShows.removeValue(forKey: id), !pending.settled {
      pending.settled = true
      pending.call.rejectEzoic(error, fallback: "Interstitial ad failed to show")
    }
  }

  func interstitialAdDidRecordImpression(_ interstitialAd: EzoicInterstitialAd) {
    emitInterstitialEvent(interstitialAd, "impression")
  }

  func interstitialAdDidRecordClick(_ interstitialAd: EzoicInterstitialAd) {
    emitInterstitialEvent(interstitialAd, "clicked")
  }

  func interstitialAdDidDismiss(_ interstitialAd: EzoicInterstitialAd) {
    emitInterstitialEvent(interstitialAd, "dismissed")
    let id = interstitialAd.adUnitIdentifier
    interstitialAds.removeValue(forKey: id)
    if let pending = pendingInterstitialShows.removeValue(forKey: id), !pending.settled {
      pending.settled = true
      pending.call.resolve()
    }
  }
}

// MARK: - EzoicInstreamAdDelegate

extension EzoicFullScreenAdManager: EzoicInstreamAdDelegate {
  // Removal happens only inside the not-yet-settled branch, and only for the
  // controller currently registered for the id, so a stale callback after
  // destroy→reload cannot settle the newer load's call.
  func instreamAd(_ instreamAd: EzoicInstreamAd, didReceiveAdTag adTagUrl: String) {
    let id = instreamAd.adUnitId
    guard instreamAds[id] === instreamAd else { return }
    guard let pending = pendingInstreamLoads[id], !pending.settled else { return }
    pending.settled = true
    pendingInstreamLoads.removeValue(forKey: id)
    pending.call.resolve(["adTagUrl": adTagUrl])
  }

  func instreamAd(_ instreamAd: EzoicInstreamAd, didFailToLoadWithError error: EzoicError) {
    let id = instreamAd.adUnitId
    guard instreamAds[id] === instreamAd else { return }
    guard let pending = pendingInstreamLoads[id], !pending.settled else { return }
    pending.settled = true
    pendingInstreamLoads.removeValue(forKey: id)
    pending.call.rejectEzoic(error, fallback: "Instream ad failed to load")
  }
}

// MARK: - Call helpers

let ezoicPluginErrorCode = "EzoicAds"

extension CAPPluginCall {
  /// Rejects with the plugin's generic code.
  func rejectPlugin(_ message: String) {
    reject(message, ezoicPluginErrorCode)
  }

  /// Rejects with the native error. For an `EzoicError` the numeric SDK code
  /// is exposed both as the string `code` and as `data.code`, which the JS
  /// `getEzoicErrorCode` helper reads (e.g. `5001` = consent required).
  func rejectEzoic(_ error: Error, fallback: String) {
    if let ezoicError = error as? EzoicError {
      let message = ezoicError.localizedDescription.isEmpty ? fallback : ezoicError.localizedDescription
      reject(message, String(ezoicError.code), ezoicError, ["code": ezoicError.code])
      return
    }
    let message = error.localizedDescription.isEmpty ? fallback : error.localizedDescription
    reject(message, ezoicPluginErrorCode, error)
  }
}
