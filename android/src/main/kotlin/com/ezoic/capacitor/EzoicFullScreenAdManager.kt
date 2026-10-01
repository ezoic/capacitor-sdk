package com.ezoic.capacitor

import android.app.Activity
import android.content.Context
import com.ezoic.ads.sdk.adunits.EzoicInterstitialAd
import com.ezoic.ads.sdk.adunits.EzoicInterstitialAdListener
import com.ezoic.ads.sdk.adunits.EzoicInterstitialAdListenerAdapter
import com.ezoic.ads.sdk.adunits.EzoicReward
import com.ezoic.ads.sdk.adunits.EzoicRewardedAd
import com.ezoic.ads.sdk.adunits.EzoicRewardedAdListener
import com.ezoic.ads.sdk.adunits.EzoicRewardedAdListenerAdapter
import com.ezoic.ads.sdk.core.EzoicError
import com.getcapacitor.JSObject
import com.getcapacitor.PluginCall

/**
 * Rewarded and interstitial ads, keyed by ad unit id. Mirrors the React Native
 * module: a loaded ad waits in a map until `show`, whose call is settled from
 * the listener (dismiss = resolve, failed-to-show = reject). Every method runs
 * on the main thread (the plugin dispatches there); the native SDK delivers
 * listener callbacks on main as well.
 */
internal class EzoicFullScreenAdManager(
  private val context: Context,
  private val emitRewarded: (JSObject) -> Unit,
  private val emitInterstitial: (JSObject) -> Unit,
) {
  private class RewardShow(val call: PluginCall) {
    var settled = false
    var reward: EzoicReward? = null
  }

  private class InterstitialShow(val call: PluginCall) {
    var settled = false
  }

  private val rewardedAds = HashMap<Int, EzoicRewardedAd>()
  private val pendingRewardShows = HashMap<Int, RewardShow>()
  private val loadingRewarded = HashSet<Int>()

  private val interstitialAds = HashMap<Int, EzoicInterstitialAd>()
  private val pendingInterstitialShows = HashMap<Int, InterstitialShow>()
  private val loadingInterstitial = HashSet<Int>()

  // --- rewarded ----------------------------------------------------------

  fun loadRewarded(rawId: String, call: PluginCall) {
    val id = rawId.toIntOrNull()
    if (id == null || id <= 0) {
      call.rejectPlugin("Invalid adUnitIdentifier: $rawId")
      return
    }
    if (rewardedAds.containsKey(id) || !loadingRewarded.add(id)) {
      call.rejectPlugin("An ad is already loaded/loading for ad unit $rawId")
      return
    }
    EzoicRewardedAd.load(context, id) { result ->
      loadingRewarded.remove(id)
      result.onSuccess { ad ->
        ad.listener = rewardedListener(rawId)
        rewardedAds[id] = ad
        call.resolve()
      }.onFailure { e -> call.rejectEzoic(e, "Rewarded ad failed to load") }
    }
  }

  fun showRewarded(rawId: String, rewardName: String?, activity: Activity?, call: PluginCall) {
    val id = rawId.toIntOrNull()
    val ad = if (id != null) rewardedAds[id] else null
    if (id == null || ad == null) {
      call.rejectPlugin("Rewarded ad not loaded for $rawId")
      return
    }
    if (pendingRewardShows.containsKey(id)) {
      call.rejectPlugin("A show is already in progress for ad unit $rawId")
      return
    }
    if (activity == null) {
      call.rejectPlugin("No current Activity to present the rewarded ad")
      return
    }
    val show = RewardShow(call)
    pendingRewardShows[id] = show
    ad.listener = rewardedListener(
      rawId,
      onDismiss = {
        rewardedAds.remove(id)
        val pending = pendingRewardShows.remove(id)
        if (pending != null && !pending.settled) {
          pending.settled = true
          val reward = pending.reward
          pending.call.resolve(
            JSObject()
              .put("earned", reward != null)
              .put("type", reward?.type ?: "")
              .put("amount", reward?.amount ?: 0),
          )
        }
      },
      onFailedToShow = { error ->
        rewardedAds.remove(id)
        val pending = pendingRewardShows.remove(id)
        if (pending != null && !pending.settled) {
          pending.settled = true
          pending.call.rejectEzoic(error, "Rewarded ad failed to show")
        }
      },
    )
    if (rewardName.isNullOrEmpty()) {
      ad.show(activity) { reward -> show.reward = reward }
    } else {
      ad.show(activity, rewardName) { reward -> show.reward = reward }
    }
  }

  /** Releases a loaded-but-unshown rewarded ad so the unit can be loaded again. */
  fun destroyRewarded(rawId: String) {
    val id = rawId.toIntOrNull() ?: return
    if (pendingRewardShows.containsKey(id)) return // showing: the listener will clean up
    rewardedAds.remove(id)?.let {
      it.listener = null
      it.destroy()
    }
  }

  private fun rewardedListener(
    rawId: String,
    onDismiss: (() -> Unit)? = null,
    onFailedToShow: ((EzoicError) -> Unit)? = null,
  ): EzoicRewardedAdListener = object : EzoicRewardedAdListenerAdapter() {
    override fun onRewardedAdShown(rewardedAd: EzoicRewardedAd) = emitRewardedEvent(rawId, "shown")

    override fun onRewardedAdFailedToShow(rewardedAd: EzoicRewardedAd, error: EzoicError) {
      emitRewardedEvent(rawId, "failedToShow", errorPayload(error.message, error.code))
      onFailedToShow?.invoke(error)
    }

    override fun onRewardedAdImpression(rewardedAd: EzoicRewardedAd) = emitRewardedEvent(rawId, "impression")
    override fun onRewardedAdClicked(rewardedAd: EzoicRewardedAd) = emitRewardedEvent(rawId, "clicked")

    override fun onUserEarnedReward(rewardedAd: EzoicRewardedAd, reward: EzoicReward) {
      emitRewardedEvent(rawId, "reward", JSObject().put("rewardType", reward.type).put("rewardAmount", reward.amount))
    }

    override fun onRewardedAdDismissed(rewardedAd: EzoicRewardedAd) {
      emitRewardedEvent(rawId, "dismissed")
      onDismiss?.invoke()
    }
  }

  private fun emitRewardedEvent(rawId: String, type: String, extra: JSObject? = null) {
    emitRewarded(eventPayload(rawId, type, extra))
  }

  // --- interstitial ------------------------------------------------------

  fun loadInterstitial(rawId: String, call: PluginCall) {
    val id = rawId.toIntOrNull()
    if (id == null || id <= 0) {
      call.rejectPlugin("Invalid adUnitIdentifier: $rawId")
      return
    }
    if (interstitialAds.containsKey(id) || !loadingInterstitial.add(id)) {
      call.rejectPlugin("An ad is already loaded/loading for ad unit $rawId")
      return
    }
    EzoicInterstitialAd.load(context, id) { result ->
      loadingInterstitial.remove(id)
      result.onSuccess { ad ->
        ad.listener = interstitialListener(rawId)
        interstitialAds[id] = ad
        call.resolve()
      }.onFailure { e -> call.rejectEzoic(e, "Interstitial ad failed to load") }
    }
  }

  fun showInterstitial(rawId: String, activity: Activity?, call: PluginCall) {
    val id = rawId.toIntOrNull()
    val ad = if (id != null) interstitialAds[id] else null
    if (id == null || ad == null) {
      call.rejectPlugin("Interstitial ad not loaded for $rawId")
      return
    }
    if (pendingInterstitialShows.containsKey(id)) {
      call.rejectPlugin("A show is already in progress for ad unit $rawId")
      return
    }
    if (activity == null) {
      call.rejectPlugin("No current Activity to present the interstitial ad")
      return
    }
    pendingInterstitialShows[id] = InterstitialShow(call)
    ad.listener = interstitialListener(
      rawId,
      onDismiss = {
        interstitialAds.remove(id)
        val pending = pendingInterstitialShows.remove(id)
        if (pending != null && !pending.settled) {
          pending.settled = true
          pending.call.resolve()
        }
      },
      onFailedToShow = { error ->
        interstitialAds.remove(id)
        val pending = pendingInterstitialShows.remove(id)
        if (pending != null && !pending.settled) {
          pending.settled = true
          pending.call.rejectEzoic(error, "Interstitial ad failed to show")
        }
      },
    )
    ad.show(activity)
  }

  /** Releases a loaded-but-unshown interstitial so the unit can be loaded again. */
  fun destroyInterstitial(rawId: String) {
    val id = rawId.toIntOrNull() ?: return
    if (pendingInterstitialShows.containsKey(id)) return
    interstitialAds.remove(id)?.let {
      it.listener = null
      it.destroy()
    }
  }

  private fun interstitialListener(
    rawId: String,
    onDismiss: (() -> Unit)? = null,
    onFailedToShow: ((EzoicError) -> Unit)? = null,
  ): EzoicInterstitialAdListener = object : EzoicInterstitialAdListenerAdapter() {
    override fun onInterstitialAdShown(interstitialAd: EzoicInterstitialAd) = emitInterstitialEvent(rawId, "shown")

    override fun onInterstitialAdFailedToShow(interstitialAd: EzoicInterstitialAd, error: EzoicError) {
      emitInterstitialEvent(rawId, "failedToShow", errorPayload(error.message, error.code))
      onFailedToShow?.invoke(error)
    }

    override fun onInterstitialAdImpression(interstitialAd: EzoicInterstitialAd) = emitInterstitialEvent(rawId, "impression")
    override fun onInterstitialAdClicked(interstitialAd: EzoicInterstitialAd) = emitInterstitialEvent(rawId, "clicked")

    override fun onInterstitialAdDismissed(interstitialAd: EzoicInterstitialAd) {
      emitInterstitialEvent(rawId, "dismissed")
      onDismiss?.invoke()
    }
  }

  private fun emitInterstitialEvent(rawId: String, type: String, extra: JSObject? = null) {
    emitInterstitial(eventPayload(rawId, type, extra))
  }

  // --- teardown ----------------------------------------------------------

  fun destroyAll() {
    for ((_, pending) in pendingRewardShows) {
      if (!pending.settled) {
        pending.settled = true
        pending.call.rejectPlugin("Plugin was destroyed while showing")
      }
    }
    pendingRewardShows.clear()
    for ((_, ad) in rewardedAds) {
      ad.listener = null
      ad.destroy()
    }
    rewardedAds.clear()
    for ((_, pending) in pendingInterstitialShows) {
      if (!pending.settled) {
        pending.settled = true
        pending.call.rejectPlugin("Plugin was destroyed while showing")
      }
    }
    pendingInterstitialShows.clear()
    for ((_, ad) in interstitialAds) {
      ad.listener = null
      ad.destroy()
    }
    interstitialAds.clear()
  }

  private fun eventPayload(rawId: String, type: String, extra: JSObject?): JSObject {
    val payload = JSObject().put("adUnitIdentifier", rawId).put("type", type)
    if (extra != null) {
      val keys = extra.keys()
      while (keys.hasNext()) {
        val key = keys.next()
        payload.put(key, extra.get(key))
      }
    }
    return payload
  }
}
