package com.ezoic.capacitor.cmp

import android.app.Activity
import android.util.Log
import com.ezoic.ads.sdk.privacy.cmp.ConsentDecisionType
import com.ezoic.ads.sdk.privacy.cmp.ConsentOutcome
import com.ezoic.ads.sdk.privacy.cmp.EzoicCmp
import com.ezoic.ads.sdk.privacy.cmp.EzoicCmpConfiguration
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/**
 * Capacitor bridge for the standalone Ezoic CMP (`EzoicCmp`).
 *
 * Capacitor invokes plugin methods on its own "CapacitorPlugins" thread; the
 * consent UI must be driven from the main thread, so the presents hop to main
 * via [runOnMain]. The outcome objects match `@ezoic/capacitor-sdk`'s.
 */
@CapacitorPlugin(name = "EzoicCmp")
class EzoicCmpPlugin : Plugin() {

  @PluginMethod
  fun initialize(call: PluginCall) {
    val domain = call.getString("domain")?.takeIf { it.isNotEmpty() }
    if (domain == null) {
      call.reject("initialize requires a non-empty `domain`.", PLUGIN_ERROR_CODE)
      return
    }
    val debug = call.optBoolean("debugEnabled", false)
    val configuration = EzoicCmpConfiguration(
      cmpEnabled = call.optBoolean("cmpEnabled", true),
      autoReadConsent = call.optBoolean("autoReadConsent", true),
      debugEnabled = debug,
    )
    val autoPresentConsent = call.optBoolean("autoPresentConsent", true)
    // Returns at once (the settings load in the background); repeat calls are
    // logged and ignored natively.
    EzoicCmp.initialize(context.applicationContext, domain, configuration)
    call.resolve()
    if (autoPresentConsent) presentConsentAfterInit(debug)
  }

  /**
   * Presents the consent dialog once after `initialize`. Native waits for the
   * settings and returns `NotRequired` where there is nothing to ask, so this
   * is a no-op there. The outcome is only logged.
   */
  private fun presentConsentAfterInit(debug: Boolean) {
    val activity = activity
    if (activity == null) {
      if (debug) Log.d(TAG, "autoPresentConsent skipped: no foreground Activity")
      return
    }
    runOnMain {
      EzoicCmp.presentConsentIfRequired(activity) { outcome ->
        if (debug) Log.d(TAG, "autoPresentConsent outcome: $outcome")
      }
    }
  }

  @PluginMethod
  fun presentConsentIfRequired(call: PluginCall) {
    presentConsent(call) { activity, callback -> EzoicCmp.presentConsentIfRequired(activity, callback) }
  }

  @PluginMethod
  fun presentConsentSettings(call: PluginCall) {
    presentConsent(call) { activity, callback -> EzoicCmp.presentConsentSettings(activity, callback) }
  }

  @PluginMethod
  fun isConsentRequired(call: PluginCall) {
    call.resolve(requiredResult(EzoicCmp.isConsentRequired))
  }

  @PluginMethod
  fun isPrivacyOptionsRequired(call: PluginCall) {
    call.resolve(requiredResult(EzoicCmp.isPrivacyOptionsRequired))
  }

  @PluginMethod
  fun resetConsent(call: PluginCall) {
    runOnMain {
      EzoicCmp.resetConsent()
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

  private fun runOnMain(block: () -> Unit) {
    val b = bridge
    if (b != null) b.executeOnMainThread(block) else activity?.runOnUiThread(block)
  }

  private fun requiredResult(required: Boolean?): JSObject {
    val result = JSObject()
    if (required == null) result.put("required", JSObject.NULL) else result.put("required", required)
    return result
  }

  private fun PluginCall.optBoolean(key: String, default: Boolean): Boolean =
    if (data.has(key) && !data.isNull(key)) data.getBoolean(key) else default

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
    is ConsentOutcome.Failed -> consentFailure(consentErrorCode(error), consentErrorMessage(error))
  }

  companion object {
    private const val TAG = "EzoicCmp"
    private const val PLUGIN_ERROR_CODE = "EzoicCmp"
    private const val NO_ACTIVITY_CODE = -1
    private const val NO_ACTIVITY_MESSAGE = "No foreground Activity"
  }
}
