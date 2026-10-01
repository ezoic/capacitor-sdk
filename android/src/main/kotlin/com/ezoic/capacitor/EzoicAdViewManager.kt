package com.ezoic.capacitor

import android.content.Context
import android.graphics.Typeface
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import com.ezoic.ads.sdk.adunits.EzoicBannerView
import com.ezoic.ads.sdk.adunits.EzoicBannerViewListener
import com.ezoic.ads.sdk.adunits.EzoicNativeAd
import com.ezoic.ads.sdk.adunits.EzoicNativeAdListener
import com.ezoic.ads.sdk.adunits.EzoicNativeAdLoadListener
import com.ezoic.ads.sdk.adunits.EzoicOutstreamAdView
import com.ezoic.ads.sdk.adunits.EzoicOutstreamAdViewListener
import com.ezoic.ads.sdk.core.EzoicError
import com.getcapacitor.JSObject
import com.google.android.gms.ads.nativead.MediaView
import com.google.android.gms.ads.nativead.NativeAd
import com.google.android.gms.ads.nativead.NativeAdView
import kotlin.math.roundToInt

/**
 * Where an ad view is overlaid. Units are CSS px, which in the Capacitor
 * WebView equal dp. `inline` frames are relative to the WebView's viewport.
 */
internal sealed class Placement {
  data class Edge(val top: Boolean, val marginDp: Int, val widthDp: Int?, val heightDp: Int?) : Placement()
  data class Inline(val xDp: Int, val yDp: Int, val widthDp: Int, val heightDp: Int) : Placement()

  companion object {
    fun parse(json: JSObject?): Placement {
      if (json == null) return Edge(top = false, marginDp = 0, widthDp = null, heightDp = null)
      return when (val position = json.optString("position", "bottom")) {
        "inline" -> {
          val frame = json.optJSONObject("frame")
            ?: throw IllegalArgumentException("An 'inline' placement requires a `frame`.")
          Inline(
            xDp = frame.optDouble("x", 0.0).roundToInt(),
            yDp = frame.optDouble("y", 0.0).roundToInt(),
            widthDp = frame.optDouble("width", 0.0).roundToInt().coerceAtLeast(0),
            heightDp = frame.optDouble("height", 0.0).roundToInt().coerceAtLeast(0),
          )
        }
        "top", "bottom" -> Edge(
          top = position == "top",
          marginDp = json.optIntOrNull("margin")?.coerceAtLeast(0) ?: 0,
          widthDp = json.optIntOrNull("width")?.coerceAtLeast(0),
          heightDp = json.optIntOrNull("height")?.coerceAtLeast(0),
        )
        else -> throw IllegalArgumentException("Unknown placement position: $position")
      }
    }
  }
}

internal enum class AdViewKind(val wire: String, val defaultHeightDp: Int?) {
  BANNER("banner", null),
  NATIVE("native", 300),
  OUTSTREAM("outstream", 250);

  companion object {
    fun parse(value: String?): AdViewKind =
      entries.firstOrNull { it.wire == value }
        ?: throw IllegalArgumentException("Unknown ad view kind: $value")
  }
}

/**
 * Owns the overlay layer above the Capacitor WebView and every native ad view
 * on it. All methods must be called on the main thread.
 *
 * Layout: one full-size, touch-transparent [FrameLayout] (the *overlay*) is
 * added to the WebView's parent and padded to the WebView's own bounds, so
 * its coordinate space is the WebView's viewport. Each ad gets a *host*
 * `FrameLayout` child positioned by its [Placement]; the native ad view lives
 * inside the host. An edge host spans the overlay's width and wraps its
 * height (so an unfilled banner takes no space and intercepts no taps), and
 * the native banner view collapses itself to `GONE` on a terminal no-fill. For `inline` placements
 * the JS side keeps the frame in sync with a DOM element and shrinks it to
 * zero height when the banner collapses.
 */
internal class EzoicAdViewManager(
  private val context: Context,
  private val webViewProvider: () -> View?,
  private val emit: (JSObject) -> Unit,
) {
  private class Entry(
    val id: String,
    val kind: AdViewKind,
    val adUnitId: Int,
    val rawAdUnitId: String,
    val sizes: List<String>,
    var collapseOnNoFill: Boolean,
    var placement: Placement,
    val host: FrameLayout,
  ) {
    var loadStarted = false
    var destroyed = false
    var userHidden = false
    var banner: EzoicBannerView? = null
    var outstream: EzoicOutstreamAdView? = null
    var nativeAd: EzoicNativeAd? = null
  }

  private val entries = LinkedHashMap<String, Entry>()
  private var overlay: FrameLayout? = null
  private var trackedWebView: View? = null
  private val density: Float get() = context.resources.displayMetrics.density

  private fun dp(value: Int): Int = (value * density).roundToInt()

  // --- overlay -----------------------------------------------------------

  private val webViewLayoutListener = View.OnLayoutChangeListener { _, _, _, _, _, _, _, _, _ -> alignOverlay() }

  /** Creates the overlay above the WebView on first use; returns null if there is no WebView yet. */
  private fun ensureOverlay(): FrameLayout? {
    overlay?.let { return it }
    val webView = webViewProvider() ?: return null
    val parent = webView.parent as? ViewGroup ?: return null
    val layer = object : FrameLayout(context) {
      // Not clickable and no background: touches outside a child fall through
      // to the WebView beneath (ViewGroup.onTouchEvent returns false).
    }
    layer.clipChildren = true
    layer.clipToPadding = true
    parent.addView(layer, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
    overlay = layer
    trackedWebView = webView
    webView.addOnLayoutChangeListener(webViewLayoutListener)
    alignOverlay()
    return layer
  }

  /**
   * Pads the overlay to the WebView's bounds within their shared parent, so
   * edge placements hug the WebView (which Capacitor already keeps out of the
   * system bars) and inline frames map 1:1 onto CSS viewport coordinates.
   */
  private fun alignOverlay() {
    val layer = overlay ?: return
    val webView = trackedWebView ?: return
    val parent = layer.parent as? ViewGroup ?: return
    val right = parent.width - webView.right
    val bottom = parent.height - webView.bottom
    layer.setPadding(webView.left.coerceAtLeast(0), webView.top.coerceAtLeast(0), right.coerceAtLeast(0), bottom.coerceAtLeast(0))
  }

  private fun removeOverlayIfEmpty() {
    if (entries.isNotEmpty()) return
    val layer = overlay ?: return
    (layer.parent as? ViewGroup)?.removeView(layer)
    trackedWebView?.removeOnLayoutChangeListener(webViewLayoutListener)
    trackedWebView = null
    overlay = null
  }

  // --- public API --------------------------------------------------------

  fun create(
    id: String,
    kind: AdViewKind,
    rawAdUnitId: String,
    sizes: List<String>,
    collapseOnNoFill: Boolean,
    placement: Placement,
  ) {
    require(!entries.containsKey(id)) { "An ad view with id $id already exists" }
    val layer = ensureOverlay() ?: throw IllegalStateException("No WebView to overlay ads on")
    val host = FrameLayout(context)
    val entry = Entry(id, kind, rawAdUnitId.toIntOrNull() ?: 0, rawAdUnitId, sizes, collapseOnNoFill, placement, host)
    entries[id] = entry
    layer.addView(host, layoutParamsFor(entry))
    applyVisibility(entry)
  }

  fun load(id: String) {
    val entry = entry(id)
    if (entry.loadStarted || entry.destroyed) return
    entry.loadStarted = true
    if (entry.adUnitId <= 0) {
      emitEvent(entry, "failed", errorPayload("Invalid ad unit identifier: ${entry.rawAdUnitId}", 0))
      return
    }
    when (entry.kind) {
      AdViewKind.BANNER -> loadBanner(entry)
      AdViewKind.OUTSTREAM -> loadOutstream(entry)
      AdViewKind.NATIVE -> loadNative(entry)
    }
  }

  fun show(id: String) {
    val entry = entry(id)
    entry.userHidden = false
    applyVisibility(entry)
  }

  fun hide(id: String) {
    val entry = entry(id)
    entry.userHidden = true
    applyVisibility(entry)
  }

  fun setPlacement(id: String, placement: Placement) {
    val entry = entry(id)
    entry.placement = placement
    entry.host.layoutParams = layoutParamsFor(entry)
  }

  fun destroy(id: String) {
    val entry = entries.remove(id) ?: return
    entry.destroyed = true
    entry.banner?.let { it.listener = null; it.stopLoading(); it.destroy() }
    entry.outstream?.let { it.listener = null; it.stopLoading(); it.destroy() }
    entry.nativeAd?.let { it.listener = null; it.destroy() }
    entry.banner = null
    entry.outstream = null
    entry.nativeAd = null
    entry.host.removeAllViews()
    (entry.host.parent as? ViewGroup)?.removeView(entry.host)
    removeOverlayIfEmpty()
  }

  fun destroyAll() {
    for (id in entries.keys.toList()) destroy(id)
  }

  // --- layout ------------------------------------------------------------

  private fun layoutParamsFor(entry: Entry): FrameLayout.LayoutParams {
    return when (val p = entry.placement) {
      is Placement.Inline -> FrameLayout.LayoutParams(dp(p.widthDp), dp(p.heightDp), Gravity.TOP or Gravity.START).apply {
        leftMargin = dp(p.xDp)
        topMargin = dp(p.yDp)
      }
      is Placement.Edge -> {
        // Always span the overlay unless an explicit width was given: the SDK
        // fits oversized Prebid creatives to the banner view's own width, so a
        // WRAP_CONTENT host would make it shrink every creative to nothing.
        // A full-width host is not clickable and takes no height until a
        // creative fills, so it never steals taps from the WebView.
        val width = p.widthDp?.let { dp(it) } ?: ViewGroup.LayoutParams.MATCH_PARENT
        val height = (p.heightDp ?: entry.kind.defaultHeightDp)?.let { dp(it) } ?: ViewGroup.LayoutParams.WRAP_CONTENT
        val gravity = (if (p.top) Gravity.TOP else Gravity.BOTTOM) or Gravity.CENTER_HORIZONTAL
        FrameLayout.LayoutParams(width, height, gravity).apply {
          if (p.top) topMargin = dp(p.marginDp) else bottomMargin = dp(p.marginDp)
        }
      }
    }
  }

  private fun applyVisibility(entry: Entry) {
    entry.host.visibility = if (entry.userHidden) View.GONE else View.VISIBLE
  }

  private fun entry(id: String): Entry =
    entries[id] ?: throw IllegalArgumentException("Unknown ad view id: $id")

  // --- banner ------------------------------------------------------------

  private fun loadBanner(entry: Entry) {
    val banner = EzoicBannerView(context, entry.adUnitId)
    banner.collapseOnNoFill = entry.collapseOnNoFill
    banner.listener = object : EzoicBannerViewListener {
      override fun onBannerLoaded(bannerView: EzoicBannerView) = emitEvent(entry, "loaded")
      override fun onBannerLoadFailed(bannerView: EzoicBannerView, error: EzoicError) =
        emitEvent(entry, "failed", errorPayload(error.message, error.code))
      override fun onBannerImpression(bannerView: EzoicBannerView) = emitEvent(entry, "impression")
      override fun onBannerClicked(bannerView: EzoicBannerView) = emitEvent(entry, "clicked")
      override fun onBannerOpened(bannerView: EzoicBannerView) = emitEvent(entry, "opened")
      override fun onBannerClosed(bannerView: EzoicBannerView) = emitEvent(entry, "closed")
      override fun onBannerSizeChanged(bannerView: EzoicBannerView, widthDp: Int, heightDp: Int) {
        emitEvent(entry, "sizeChanged", JSObject().put("width", widthDp).put("height", heightDp))
        entry.host.requestLayout()
      }
    }
    entry.banner = banner
    // The banner view spans the host's width (the SDK uses that width as the
    // "available width" when fitting Prebid creatives and centres the GAM
    // view inside itself); its height follows the creative, so a fixed-height
    // inline host keeps it vertically centred.
    entry.host.addView(
      banner,
      FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.CENTER),
    )
    if (entry.sizes.isEmpty()) banner.loadAd() else banner.loadAd(entry.sizes)
  }

  // --- outstream ---------------------------------------------------------

  private fun loadOutstream(entry: Entry) {
    val view = EzoicOutstreamAdView(context, entry.adUnitId)
    view.collapseOnNoFill = entry.collapseOnNoFill
    view.listener = object : EzoicOutstreamAdViewListener {
      override fun onOutstreamLoaded(adView: EzoicOutstreamAdView) = emitEvent(entry, "loaded")
      override fun onOutstreamLoadFailed(adView: EzoicOutstreamAdView, error: EzoicError) =
        emitEvent(entry, "failed", errorPayload(error.message, error.code))
      override fun onOutstreamSizeChanged(adView: EzoicOutstreamAdView, widthDp: Int, heightDp: Int) {
        emitEvent(entry, "sizeChanged", JSObject().put("width", widthDp).put("height", heightDp))
        entry.host.requestLayout()
      }
      override fun onOutstreamImpression(adView: EzoicOutstreamAdView) = emitEvent(entry, "impression")
      override fun onOutstreamClicked(adView: EzoicOutstreamAdView) = emitEvent(entry, "clicked")
      override fun onOutstreamOpened(adView: EzoicOutstreamAdView) = emitEvent(entry, "opened")
      override fun onOutstreamClosed(adView: EzoicOutstreamAdView) = emitEvent(entry, "closed")
    }
    entry.outstream = view
    entry.host.addView(
      view,
      FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT),
    )
    view.loadAd()
  }

  // --- native ------------------------------------------------------------

  private fun loadNative(entry: Entry) {
    EzoicNativeAd.load(context, entry.adUnitId, object : EzoicNativeAdLoadListener {
      override fun onNativeAdLoaded(nativeAd: EzoicNativeAd) {
        // destroy() and this callback both arrive on the main thread; a late
        // ad for a destroyed view is released, not rendered.
        if (entry.destroyed) {
          nativeAd.destroy()
          return
        }
        val gmaAd = nativeAd.nativeAd ?: run {
          nativeAd.destroy()
          emitEvent(entry, "failed", errorPayload("Native ad loaded without content", 0))
          return
        }
        entry.nativeAd = nativeAd
        // Attach the lifecycle listener before the rendered NativeAdView
        // registers — the impression fires as soon as the view is displayed.
        nativeAd.listener = object : EzoicNativeAdListener {
          override fun onNativeAdImpression(nativeAd: EzoicNativeAd) = emitEvent(entry, "impression")
          override fun onNativeAdClicked(nativeAd: EzoicNativeAd) = emitEvent(entry, "clicked")
          override fun onNativeAdOpened(nativeAd: EzoicNativeAd) = emitEvent(entry, "opened")
          override fun onNativeAdClosed(nativeAd: EzoicNativeAd) = emitEvent(entry, "closed")
        }
        val adView = buildNativeTemplate(context, gmaAd)
        entry.host.removeAllViews()
        entry.host.addView(
          adView,
          FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT),
        )
        emitEvent(entry, "loaded")
      }

      override fun onNativeAdFailedToLoad(error: EzoicError) {
        if (entry.destroyed) return
        emitEvent(entry, "failed", errorPayload(error.message, error.code))
      }
    })
  }

  /**
   * Builds a template [NativeAdView] in code (no `res/` layouts), matching the
   * React Native and Flutter wrappers: a header row (icon + headline /
   * advertiser), a [MediaView], the body text and a call-to-action button.
   * Only the asset views present on [gmaAd] are created and registered;
   * [NativeAdView.setNativeAd] is called last, as GMA requires.
   */
  private fun buildNativeTemplate(context: Context, gmaAd: NativeAd): NativeAdView {
    val adView = NativeAdView(context)

    val root = LinearLayout(context).apply {
      orientation = LinearLayout.VERTICAL
      layoutParams = FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
      val pad = dp(8)
      setPadding(pad, pad, pad, pad)
    }

    val headerRow = LinearLayout(context).apply {
      orientation = LinearLayout.HORIZONTAL
      layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
    }

    var iconView: ImageView? = null
    gmaAd.icon?.drawable?.let { drawable ->
      val iv = ImageView(context).apply {
        layoutParams = LinearLayout.LayoutParams(dp(40), dp(40))
        setImageDrawable(drawable)
      }
      headerRow.addView(iv)
      iconView = iv
    }

    val textColumn = LinearLayout(context).apply {
      orientation = LinearLayout.VERTICAL
      layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply { leftMargin = dp(8) }
    }

    var headlineView: TextView? = null
    gmaAd.headline?.let { text ->
      val tv = TextView(context).apply {
        this.text = text
        setTypeface(typeface, Typeface.BOLD)
        textSize = 16f
      }
      textColumn.addView(tv)
      headlineView = tv
    }

    var advertiserView: TextView? = null
    gmaAd.advertiser?.let { text ->
      val tv = TextView(context).apply {
        this.text = text
        textSize = 12f
      }
      textColumn.addView(tv)
      advertiserView = tv
    }

    headerRow.addView(textColumn)
    root.addView(headerRow)

    var mediaView: MediaView? = null
    gmaAd.mediaContent?.let { content ->
      val mv = MediaView(context).apply {
        layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(175)).apply { topMargin = dp(8) }
        mediaContent = content
      }
      root.addView(mv)
      mediaView = mv
    }

    var bodyView: TextView? = null
    gmaAd.body?.let { text ->
      val tv = TextView(context).apply {
        this.text = text
        textSize = 14f
        setPadding(0, dp(8), 0, 0)
      }
      root.addView(tv)
      bodyView = tv
    }

    var callToActionView: Button? = null
    gmaAd.callToAction?.let { text ->
      val btn = Button(context).apply {
        this.text = text
        layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
          topMargin = dp(8)
        }
      }
      root.addView(btn)
      callToActionView = btn
    }

    adView.addView(root)
    adView.headlineView = headlineView
    adView.bodyView = bodyView
    adView.iconView = iconView
    adView.advertiserView = advertiserView
    adView.callToActionView = callToActionView
    adView.mediaView = mediaView
    adView.setNativeAd(gmaAd)
    return adView
  }

  // --- events ------------------------------------------------------------

  private fun emitEvent(entry: Entry, type: String, extra: JSObject? = null) {
    if (entry.destroyed) return
    val payload = JSObject().put("id", entry.id).put("type", type)
    if (extra != null) {
      val keys = extra.keys()
      while (keys.hasNext()) {
        val key = keys.next()
        payload.put(key, extra.get(key))
      }
    }
    emit(payload)
  }
}
