package com.ezoic.capacitor

import android.app.Activity
import android.app.Application
import android.util.Log
import com.ezoic.ads.sdk.core.EzoicAds
import com.ezoic.ads.sdk.core.EzoicConfiguration
import com.ezoic.ads.sdk.privacy.cmp.ConsentDecisionType
import com.ezoic.ads.sdk.privacy.cmp.ConsentOutcome
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/**
 * Capacitor bridge for the Ezoic Ads SDK.
 *
 * Capacitor invokes plugin methods on its own "CapacitorPlugins" thread, while
 * the native SDK (and the overlay views) must be driven from the main thread,
 * so every method hops to main via [runOnMain]. Holding a [PluginCall] across
 * that hop and settling it later is fine — Capacitor keeps the call alive
 * until it is resolved or rejected.
 *
 * Events: `adViewEvent` (`{id, type, ...}`), `rewardedAdEvent` and
 * `interstitialAdEvent` (`{adUnitIdentifier, type, ...}`).
 */
@CapacitorPlugin(name = "EzoicAds")
class EzoicAdsPlugin : Plugin() {
  private lateinit var adViews: EzoicAdViewManager
  private lateinit var fullScreen: EzoicFullScreenAdManager
  private lateinit var instream: EzoicInstreamAdManager

  override fun load() {
    adViews = EzoicAdViewManager(context, { bridge?.webView }) { notifyListeners(AD_VIEW_EVENT, it, true) }
    fullScreen = EzoicFullScreenAdManager(
      context,
      emitRewarded = { notifyListeners(REWARDED_EVENT, it, true) },
      emitInterstitial = { notifyListeners(INTERSTITIAL_EVENT, it, true) },
    )
    instream = EzoicInstreamAdManager(context)
  }

  override fun handleOnDestroy() {
    runOnMain {
      adViews.destroyAll()
      fullScreen.destroyAll()
      instream.destroyAll()
    }
  }

  // --- lifecycle -----------------------------------------------------------

  @PluginMethod
  fun initialize(call: PluginCall) {
    val domain = call.optString("domain")
    if (domain.isNullOrEmpty()) {
      call.rejectPlugin("initialize requires a non-empty `domain`.")
      return
    }
    val app = context.applicationContext as? Application
    if (app == null) {
      call.rejectPlugin("No Application context available.")
      return
    }
    val configuration = EzoicConfiguration(
      domain = domain,
      autoReadConsent = call.optBoolean("autoReadConsent", true),
      subjectToCOPPA = call.optBoolean("subjectToCOPPA", false),
      requestATTBeforeAds = call.optBoolean("requestATTBeforeAds", true),
      debugEnabled = call.optBoolean("debugEnabled", false),
      testMode = call.optBoolean("testMode", false),
      autoTrackPageviews = call.optBoolean("autoTrackPageviews", true),
      cmpEnabled = call.optBoolean("cmpEnabled", true),
    )
    val autoPresentConsent = call.optBoolean("autoPresentConsent", true)
    runOnMain {
      EzoicAds.instance.initialize(app, configuration) { result ->
        result.onSuccess {
          call.resolve()
          if (autoPresentConsent) presentConsentAfterInit(configuration.debugEnabled)
        }.onFailure { e -> call.rejectEzoic(e, "Ezoic initialization failed") }
      }
    }
  }

  /**
   * Presents the consent dialog once after a successful `initialize`. Native
   * returns `NotRequired` outside GDPR / with `cmpEnabled = false` / with
   * another CMP or manual consent, so this is a no-op there. The outcome is
   * only logged; publishers wanting it call `presentConsentIfRequired`.
   */
  private fun presentConsentAfterInit(debug: Boolean) {
    val activity = activity
    if (activity == null) {
      if (debug) Log.d(TAG, "autoPresentConsent skipped: no foreground Activity")
      return
    }
    runOnMain {
      EzoicAds.instance.presentConsentIfRequired(activity) { outcome ->
        if (debug) Log.d(TAG, "autoPresentConsent outcome: $outcome")
      }
    }
  }

  @PluginMethod
  fun trackPageview(call: PluginCall) {
    val screen = call.optString("screen")
    runOnMain {
      val completion: (Boolean) -> Unit = { tracked -> call.resolve(JSObject().put("tracked", tracked)) }
      if (screen.isNullOrEmpty()) {
        EzoicAds.instance.trackPageview(completion)
      } else {
        EzoicAds.instance.trackPageview(screen, completion)
      }
    }
  }

  // --- privacy -------------------------------------------------------------

  @PluginMethod
  fun setGDPRConsent(call: PluginCall) {
    val applies = call.getBoolean("applies")
    if (applies == null) {
      call.rejectPlugin("setGDPRConsent requires `applies`.")
      return
    }
    val consentString = call.optString("consentString")
    runOnMain {
      EzoicAds.instance.setGDPRConsent(applies, consentString)
      call.resolve()
    }
  }

  @PluginMethod
  fun setGPPConsent(call: PluginCall) {
    val gppString = call.optString("gppString")
    val sectionIds = call.optString("sectionIds")
    runOnMain {
      EzoicAds.instance.setGPPConsent(gppString, sectionIds)
      call.resolve()
    }
  }

  @PluginMethod
  fun setSubjectToCOPPA(call: PluginCall) {
    val value = call.getBoolean("value")
    if (value == null) {
      call.rejectPlugin("setSubjectToCOPPA requires `value`.")
      return
    }
    runOnMain {
      EzoicAds.instance.setSubjectToCOPPA(value)
      call.resolve()
    }
  }

  // --- consent (built-in CMP) ----------------------------------------------

  @PluginMethod
  fun presentConsentIfRequired(call: PluginCall) {
    presentConsent(call) { activity, callback -> EzoicAds.instance.presentConsentIfRequired(activity, callback) }
  }

  @PluginMethod
  fun presentConsentSettings(call: PluginCall) {
    presentConsent(call) { activity, callback -> EzoicAds.instance.presentConsentSettings(activity, callback) }
  }

  @PluginMethod
  fun isConsentRequired(call: PluginCall) {
    runOnMain {
      val result = JSObject()
      val required: Boolean? = EzoicAds.instance.isConsentRequired
      if (required == null) result.put("required", JSObject.NULL) else result.put("required", required)
      call.resolve(result)
    }
  }

  @PluginMethod
  fun resetConsent(call: PluginCall) {
    runOnMain {
      EzoicAds.instance.resetConsent()
      call.resolve()
    }
  }

  /**
   * Presents from the foreground Activity on the UI thread and always resolves
   * with an outcome object; with no Activity it resolves `failed(-1)`.
   */
  private fun presentConsent(call: PluginCall, present: (Activity, (ConsentOutcome) -> Unit) -> Unit) {
    val activity = activity
    if (activity == null) {
      call.resolve(consentFailure(NO_ACTIVITY_CODE, NO_ACTIVITY_MESSAGE))
      return
    }
    runOnMain {
      present(activity) { outcome -> call.resolve(outcome.toJSObject()) }
    }
  }

  // --- ad views (banner / native / outstream overlays) ---------------------

  @PluginMethod
  fun createAdView(call: PluginCall) {
    val id = call.optString("id")
    val adUnitIdentifier = call.optString("adUnitIdentifier")
    if (id.isNullOrEmpty() || adUnitIdentifier.isNullOrEmpty()) {
      call.rejectPlugin("createAdView requires `id` and `adUnitIdentifier`.")
      return
    }
    val kind: AdViewKind
    val placement: Placement
    try {
      kind = AdViewKind.parse(call.optString("kind"))
      placement = Placement.parse(call.getObject("placement", null))
    } catch (e: IllegalArgumentException) {
      call.rejectPlugin(e.message ?: "Invalid createAdView options")
      return
    }
    val sizes = call.getArray("size", null)?.toList<String>()?.map { it.trim() }?.filter { it.isNotEmpty() } ?: emptyList()
    val collapseOnNoFill = call.optBoolean("collapseOnNoFill", true)
    runOnMain {
      try {
        adViews.create(id, kind, adUnitIdentifier, sizes, collapseOnNoFill, placement)
        call.resolve()
      } catch (e: Exception) {
        call.rejectPlugin(e.message ?: "Failed to create ad view")
      }
    }
  }

  @PluginMethod
  fun loadAdView(call: PluginCall) = withAdView(call) { adViews.load(it) }

  @PluginMethod
  fun showAdView(call: PluginCall) = withAdView(call) { adViews.show(it) }

  @PluginMethod
  fun hideAdView(call: PluginCall) = withAdView(call) { adViews.hide(it) }

  @PluginMethod
  fun setAdViewPlacement(call: PluginCall) {
    val placement: Placement
    try {
      placement = Placement.parse(call.getObject("placement", null))
    } catch (e: IllegalArgumentException) {
      call.rejectPlugin(e.message ?: "Invalid placement")
      return
    }
    withAdView(call) { adViews.setPlacement(it, placement) }
  }

  @PluginMethod
  fun destroyAdView(call: PluginCall) = withAdView(call) { adViews.destroy(it) }

  private fun withAdView(call: PluginCall, block: (String) -> Unit) {
    val id = call.optString("id")
    if (id.isNullOrEmpty()) {
      call.rejectPlugin("Missing ad view `id`.")
      return
    }
    runOnMain {
      try {
        block(id)
        call.resolve()
      } catch (e: Exception) {
        call.rejectPlugin(e.message ?: "Ad view operation failed")
      }
    }
  }

  // --- rewarded ------------------------------------------------------------

  @PluginMethod
  fun loadRewardedAd(call: PluginCall) {
    val id = requireAdUnit(call) ?: return
    runOnMain { fullScreen.loadRewarded(id, call) }
  }

  @PluginMethod
  fun showRewardedAd(call: PluginCall) {
    val id = requireAdUnit(call) ?: return
    val rewardName = call.optString("rewardName")
    runOnMain { fullScreen.showRewarded(id, rewardName, activity, call) }
  }

  @PluginMethod
  fun destroyRewardedAd(call: PluginCall) {
    val id = requireAdUnit(call) ?: return
    runOnMain {
      fullScreen.destroyRewarded(id)
      call.resolve()
    }
  }

  // --- interstitial --------------------------------------------------------

  @PluginMethod
  fun loadInterstitialAd(call: PluginCall) {
    val id = requireAdUnit(call) ?: return
    runOnMain { fullScreen.loadInterstitial(id, call) }
  }

  @PluginMethod
  fun showInterstitialAd(call: PluginCall) {
    val id = requireAdUnit(call) ?: return
    runOnMain { fullScreen.showInterstitial(id, activity, call) }
  }

  @PluginMethod
  fun destroyInterstitialAd(call: PluginCall) {
    val id = requireAdUnit(call) ?: return
    runOnMain {
      fullScreen.destroyInterstitial(id)
      call.resolve()
    }
  }

  // --- instream ------------------------------------------------------------

  @PluginMethod
  fun loadInstreamAd(call: PluginCall) {
    val id = requireNumericAdUnit(call) ?: return
    val contentUrl = call.optString("contentUrl")
    runOnMain { instream.load(id, contentUrl, call) }
  }

  @PluginMethod
  fun getInstreamNextAdTagUrl(call: PluginCall) {
    val id = requireNumericAdUnit(call) ?: return
    runOnMain {
      val result = JSObject()
      val url = instream.nextAdTagUrl(id)
      if (url == null) result.put("adTagUrl", JSObject.NULL) else result.put("adTagUrl", url)
      call.resolve(result)
    }
  }

  @PluginMethod
  fun reportInstreamImpression(call: PluginCall) {
    val id = requireNumericAdUnit(call) ?: return
    val revenueUsd = call.getDouble("revenueUsd")
    runOnMain {
      instream.reportImpression(id, revenueUsd)
      call.resolve()
    }
  }

  @PluginMethod
  fun destroyInstreamAd(call: PluginCall) {
    val id = requireNumericAdUnit(call) ?: return
    runOnMain {
      instream.destroy(id)
      call.resolve()
    }
  }

  // --- helpers -------------------------------------------------------------

  private fun requireAdUnit(call: PluginCall): String? {
    val id = call.optString("adUnitIdentifier")
    if (id.isNullOrEmpty()) {
      call.rejectPlugin("Missing `adUnitIdentifier`.")
      return null
    }
    return id
  }

  /** Instream ids arrive as JS numbers; accept numeric strings too. */
  private fun requireNumericAdUnit(call: PluginCall): Int? {
    val id = call.getInt("adUnitIdentifier") ?: call.optString("adUnitIdentifier")?.toIntOrNull()
    if (id == null || id <= 0) {
      call.rejectPlugin("Invalid `adUnitIdentifier`.")
      return null
    }
    return id
  }

  private fun runOnMain(block: () -> Unit) {
    val b = bridge
    if (b != null) b.executeOnMainThread(block) else activity?.runOnUiThread(block)
  }

  private fun consentFailure(code: Int, message: String): JSObject =
    JSObject().put("type", "failed").put("code", code).put("message", message)

  private fun ConsentOutcome.toJSObject(): JSObject = when (this) {
    ConsentOutcome.NotRequired -> JSObject().put("type", "notRequired")
    ConsentOutcome.AlreadyDecided -> JSObject().put("type", "alreadyDecided")
    ConsentOutcome.Dismissed -> JSObject().put("type", "dismissed")
    ConsentOutcome.AlreadyPresenting -> JSObject().put("type", "alreadyPresenting")
    is ConsentOutcome.Decided -> JSObject().put("type", "decided").put(
      "decision",
      when (decision) {
        ConsentDecisionType.ACCEPT_ALL -> "acceptAll"
        ConsentDecisionType.REJECT_ALL -> "rejectAll"
        ConsentDecisionType.CUSTOM -> "custom"
      },
    )
    is ConsentOutcome.Failed -> consentFailure(error.code, error.message)
  }

  companion object {
    private const val TAG = "EzoicAds"
    private const val AD_VIEW_EVENT = "adViewEvent"
    private const val REWARDED_EVENT = "rewardedAdEvent"
    private const val INTERSTITIAL_EVENT = "interstitialAdEvent"
    private const val NO_ACTIVITY_CODE = -1
    private const val NO_ACTIVITY_MESSAGE = "No foreground Activity"
  }
}
