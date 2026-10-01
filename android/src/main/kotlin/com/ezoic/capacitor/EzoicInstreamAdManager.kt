package com.ezoic.capacitor

import android.content.Context
import com.ezoic.ads.sdk.adunits.EzoicInstreamAd
import com.ezoic.ads.sdk.adunits.EzoicInstreamAdListener
import com.ezoic.ads.sdk.core.EzoicError
import com.getcapacitor.JSObject
import com.getcapacitor.PluginCall

/**
 * Instream controllers, keyed by ad unit id. Instream is multi-use and
 * prefetchable, so a controller is created-or-reused per id and NOT
 * auto-destroyed — it lives until `destroy` or plugin teardown. Mirrors the
 * React Native module. Every method runs on the main thread.
 */
internal class EzoicInstreamAdManager(private val context: Context) {
  private class PendingLoad(val call: PluginCall) {
    var settled = false
  }

  private val controllers = HashMap<Int, EzoicInstreamAd>()

  /**
   * In-flight loads. Doubles as the duplicate-load guard: the native `load`
   * is a SILENT no-op while already loading, so an overlapping load must be
   * rejected here or its call hangs forever.
   */
  private val loading = HashMap<Int, PendingLoad>()

  fun load(id: Int, contentUrl: String?, call: PluginCall) {
    if (loading.containsKey(id)) {
      call.rejectPlugin("An instream ad is already loading for ad unit $id")
      return
    }
    val ad = controllers.getOrPut(id) { EzoicInstreamAd(id) }
    val holder = PendingLoad(call)
    loading[id] = holder
    ad.load(context, contentUrl, object : EzoicInstreamAdListener {
      override fun onAdTagReady(adTagUrl: String) {
        // Only the winning settle removes the holder, so a stale callback
        // after destroy→reload cannot evict the newer load's holder.
        if (holder.settled) return
        holder.settled = true
        if (loading[id] === holder) loading.remove(id)
        call.resolve(JSObject().put("adTagUrl", adTagUrl))
      }

      override fun onAdFailedToLoad(error: EzoicError) {
        if (holder.settled) return
        holder.settled = true
        if (loading[id] === holder) loading.remove(id)
        call.rejectEzoic(error, "Instream ad failed to load")
      }
    })
  }

  /** The next waterfall tag, or null when exhausted / before a load / after destroy. */
  fun nextAdTagUrl(id: Int): String? = controllers[id]?.getNextAdTagUrl()

  fun reportImpression(id: Int, revenueUsd: Double?) {
    controllers[id]?.reportImpression(revenueUsd)
  }

  fun destroy(id: Int) {
    // The native SDK suppresses load callbacks once destroyed, so settle any
    // pending load's call HERE first or it hangs forever.
    loading.remove(id)?.let { pending ->
      if (!pending.settled) {
        pending.settled = true
        pending.call.rejectPlugin("Instream ad was destroyed while loading")
      }
    }
    controllers.remove(id)?.destroy()
  }

  fun destroyAll() {
    for ((_, pending) in loading) {
      if (!pending.settled) {
        pending.settled = true
        pending.call.rejectPlugin("Plugin was destroyed while loading")
      }
    }
    loading.clear()
    for ((_, ad) in controllers) ad.destroy()
    controllers.clear()
  }
}
