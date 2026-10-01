import UIKit
#if canImport(EzoicAdsSDK)
import EzoicAdsSDK
#else
import EzoicAdsSDKBinary
#endif

/// Where an ad view is overlaid. Units are CSS px, which in the Capacitor
/// `WKWebView` equal points. `inline` frames are relative to the WebView's
/// viewport (what `getBoundingClientRect()` reports in JS).
enum EzoicPlacement {
  case edge(top: Bool, margin: CGFloat, width: CGFloat?, height: CGFloat?)
  case inline(CGRect)

  static func parse(_ json: [String: Any]?) throws -> EzoicPlacement {
    guard let json = json else { return .edge(top: false, margin: 0, width: nil, height: nil) }
    let position = (json["position"] as? String) ?? "bottom"
    switch position {
    case "inline":
      guard let frame = json["frame"] as? [String: Any] else {
        throw EzoicPluginError.invalidArgument("An 'inline' placement requires a `frame`.")
      }
      return .inline(CGRect(
        x: number(frame["x"]) ?? 0,
        y: number(frame["y"]) ?? 0,
        width: max(0, number(frame["width"]) ?? 0),
        height: max(0, number(frame["height"]) ?? 0)
      ))
    case "top", "bottom":
      return .edge(
        top: position == "top",
        margin: max(0, number(json["margin"]) ?? 0),
        width: number(json["width"]).map { max(0, $0) },
        height: number(json["height"]).map { max(0, $0) }
      )
    default:
      throw EzoicPluginError.invalidArgument("Unknown placement position: \(position)")
    }
  }

  private static func number(_ value: Any?) -> CGFloat? {
    if let n = value as? NSNumber { return CGFloat(n.doubleValue) }
    if let d = value as? Double { return CGFloat(d) }
    if let i = value as? Int { return CGFloat(i) }
    return nil
  }
}

enum EzoicAdViewKind: String {
  case banner
  case native
  case outstream

  /// Default host height for an edge placement without an explicit height.
  /// Banners start at 0 and grow from `didChangeSize`.
  var defaultHeight: CGFloat {
    switch self {
    case .banner: return 0
    case .native: return 300
    case .outstream: return 250
    }
  }
}

enum EzoicPluginError: Error, LocalizedError {
  case invalidArgument(String)
  case invalidState(String)

  var errorDescription: String? {
    switch self {
    case .invalidArgument(let message), .invalidState(let message):
      return message
    }
  }
}

/// A full-size, touch-transparent layer above the WebView: taps that do not
/// hit an ad fall through to the web content beneath.
final class EzoicOverlayView: UIView {
  override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
    let hit = super.hitTest(point, with: event)
    return hit === self ? nil : hit
  }
}

/// Owns the overlay layer above the Capacitor WebView and every native ad view
/// on it. All methods must be called on the main thread.
///
/// Each ad gets a *host* view positioned by its placement; the native ad view
/// lives inside the host. For edge placements without an explicit size, a
/// banner's host tracks the creative size reported by the SDK (0×0 until the
/// first fill and again on collapse), so an unfilled banner occupies no space
/// and intercepts no taps. For `inline` placements the JS side keeps the
/// frame in sync with a DOM element.
final class EzoicAdViewManager {
  private final class Entry {
    let id: String
    let kind: EzoicAdViewKind
    let adUnitId: Int
    let rawAdUnitId: String
    let sizes: [String]
    let collapseOnNoFill: Bool
    var placement: EzoicPlacement
    let host = UIView()
    var constraints: [NSLayoutConstraint] = []
    var widthConstraint: NSLayoutConstraint?
    var heightConstraint: NSLayoutConstraint?
    var reportedSize: CGSize = .zero
    var loadStarted = false
    var destroyed = false
    var userHidden = false
    var banner: EzoicBannerView?
    var outstream: EzoicOutstreamAdView?
    var nativeAd: EzoicNativeAd?
    var delegateProxy: AnyObject?

    init(id: String, kind: EzoicAdViewKind, rawAdUnitId: String, sizes: [String], collapseOnNoFill: Bool, placement: EzoicPlacement) {
      self.id = id
      self.kind = kind
      self.adUnitId = Int(rawAdUnitId) ?? 0
      self.rawAdUnitId = rawAdUnitId
      self.sizes = sizes
      self.collapseOnNoFill = collapseOnNoFill
      self.placement = placement
      host.translatesAutoresizingMaskIntoConstraints = false
      host.clipsToBounds = true
      host.backgroundColor = .clear
    }

    /// Edge-placed host height when none is given: the last reported creative
    /// height (0 for a fresh banner, so it takes no space until fill) or the
    /// kind's default for outstream before its first size report.
    var reportedHeightOrDefault: CGFloat {
      if kind == .banner || sizeReported { return reportedSize.height }
      return kind.defaultHeight
    }
    var sizeReported = false
  }

  private var entries: [String: Entry] = [:]
  private var overlay: EzoicOverlayView?
  private let webViewProvider: () -> UIView?
  private let emit: ([String: Any]) -> Void

  init(webViewProvider: @escaping () -> UIView?, emit: @escaping ([String: Any]) -> Void) {
    self.webViewProvider = webViewProvider
    self.emit = emit
  }

  // MARK: - Overlay

  /// Creates the overlay above the WebView on first use, pinned to the
  /// WebView's edges so its coordinate space is the CSS viewport.
  private func ensureOverlay() -> EzoicOverlayView? {
    if let overlay = overlay, overlay.superview != nil { return overlay }
    guard let webView = webViewProvider(), let parent = webView.superview else { return nil }
    let layer = EzoicOverlayView()
    layer.translatesAutoresizingMaskIntoConstraints = false
    layer.backgroundColor = .clear
    layer.clipsToBounds = true
    parent.insertSubview(layer, aboveSubview: webView)
    NSLayoutConstraint.activate([
      layer.topAnchor.constraint(equalTo: webView.topAnchor),
      layer.leadingAnchor.constraint(equalTo: webView.leadingAnchor),
      layer.trailingAnchor.constraint(equalTo: webView.trailingAnchor),
      layer.bottomAnchor.constraint(equalTo: webView.bottomAnchor),
    ])
    overlay = layer
    return layer
  }

  private func removeOverlayIfEmpty() {
    guard entries.isEmpty, let layer = overlay else { return }
    layer.removeFromSuperview()
    overlay = nil
  }

  // MARK: - API

  func create(id: String, kind: EzoicAdViewKind, rawAdUnitId: String, sizes: [String], collapseOnNoFill: Bool, placement: EzoicPlacement) throws {
    guard entries[id] == nil else { throw EzoicPluginError.invalidState("An ad view with id \(id) already exists") }
    guard let layer = ensureOverlay() else { throw EzoicPluginError.invalidState("No WebView to overlay ads on") }
    let entry = Entry(id: id, kind: kind, rawAdUnitId: rawAdUnitId, sizes: sizes, collapseOnNoFill: collapseOnNoFill, placement: placement)
    entries[id] = entry
    layer.addSubview(entry.host)
    applyLayout(entry, in: layer)
    applyVisibility(entry)
  }

  func load(id: String) throws {
    let entry = try self.entry(id)
    if entry.loadStarted || entry.destroyed { return }
    entry.loadStarted = true
    guard entry.adUnitId > 0 else {
      emitEvent(entry, "failed", ["message": "Invalid ad unit identifier: \(entry.rawAdUnitId)", "code": 0])
      return
    }
    switch entry.kind {
    case .banner: loadBanner(entry)
    case .outstream: loadOutstream(entry)
    case .native: loadNative(entry)
    }
  }

  func show(id: String) throws {
    let entry = try self.entry(id)
    entry.userHidden = false
    applyVisibility(entry)
  }

  func hide(id: String) throws {
    let entry = try self.entry(id)
    entry.userHidden = true
    applyVisibility(entry)
  }

  func setPlacement(id: String, placement: EzoicPlacement) throws {
    let entry = try self.entry(id)
    entry.placement = placement
    if let layer = overlay { applyLayout(entry, in: layer) }
  }

  func destroy(id: String) {
    guard let entry = entries.removeValue(forKey: id) else { return }
    entry.destroyed = true
    entry.banner?.delegate = nil
    entry.banner?.removeFromSuperview()
    entry.outstream?.delegate = nil
    entry.outstream?.destroy()
    entry.outstream?.removeFromSuperview()
    entry.nativeAd?.delegate = nil
    entry.nativeAd?.destroy()
    entry.banner = nil
    entry.outstream = nil
    entry.nativeAd = nil
    entry.delegateProxy = nil
    NSLayoutConstraint.deactivate(entry.constraints)
    entry.host.subviews.forEach { $0.removeFromSuperview() }
    entry.host.removeFromSuperview()
    removeOverlayIfEmpty()
  }

  func destroyAll() {
    for id in Array(entries.keys) { destroy(id: id) }
  }

  // MARK: - Layout

  private func applyLayout(_ entry: Entry, in layer: UIView) {
    NSLayoutConstraint.deactivate(entry.constraints)
    entry.constraints = []
    entry.widthConstraint = nil
    entry.heightConstraint = nil
    let host = entry.host

    switch entry.placement {
    case .inline(let frame):
      let width = host.widthAnchor.constraint(equalToConstant: frame.width)
      let height = host.heightAnchor.constraint(equalToConstant: frame.height)
      entry.constraints = [
        host.leadingAnchor.constraint(equalTo: layer.leadingAnchor, constant: frame.minX),
        host.topAnchor.constraint(equalTo: layer.topAnchor, constant: frame.minY),
        width,
        height,
      ]
    case .edge(let top, let margin, let explicitWidth, let explicitHeight):
      let safe = layer.safeAreaLayoutGuide
      var constraints: [NSLayoutConstraint] = [host.centerXAnchor.constraint(equalTo: layer.centerXAnchor)]
      if top {
        constraints.append(host.topAnchor.constraint(equalTo: safe.topAnchor, constant: margin))
      } else {
        constraints.append(host.bottomAnchor.constraint(equalTo: safe.bottomAnchor, constant: -margin))
      }
      let width: NSLayoutConstraint
      if let explicitWidth = explicitWidth {
        width = host.widthAnchor.constraint(equalToConstant: explicitWidth)
      } else if entry.kind == .banner {
        width = host.widthAnchor.constraint(equalToConstant: entry.reportedSize.width)
        entry.widthConstraint = width
      } else {
        width = host.widthAnchor.constraint(equalTo: layer.widthAnchor)
      }
      let height: NSLayoutConstraint
      if let explicitHeight = explicitHeight {
        height = host.heightAnchor.constraint(equalToConstant: explicitHeight)
      } else {
        let initial = entry.kind == .native ? entry.kind.defaultHeight : entry.reportedHeightOrDefault
        height = host.heightAnchor.constraint(equalToConstant: initial)
        if entry.kind != .native { entry.heightConstraint = height }
      }
      constraints.append(contentsOf: [width, height])
      entry.constraints = constraints
    }
    NSLayoutConstraint.activate(entry.constraints)
    layer.setNeedsLayout()
  }

  private func applyVisibility(_ entry: Entry) {
    entry.host.isHidden = entry.userHidden
  }

  private func entry(_ id: String) throws -> Entry {
    guard let entry = entries[id] else { throw EzoicPluginError.invalidArgument("Unknown ad view id: \(id)") }
    return entry
  }

  /// Applies an SDK-reported creative size to an edge-placed host that has
  /// no explicit size (banner: width + height; outstream: height only).
  private func applyReportedSize(_ entry: Entry, _ size: CGSize) {
    entry.reportedSize = size
    entry.sizeReported = true
    entry.widthConstraint?.constant = size.width
    entry.heightConstraint?.constant = size.height
    entry.host.superview?.layoutIfNeeded()
  }

  // MARK: - Banner

  private func loadBanner(_ entry: Entry) {
    let view = EzoicBannerView(adUnitIdentifier: entry.adUnitId)
    view.collapseOnNoFill = entry.collapseOnNoFill
    let proxy = BannerDelegate(manager: self, entry: entry)
    entry.delegateProxy = proxy
    view.delegate = proxy
    view.translatesAutoresizingMaskIntoConstraints = false
    entry.host.addSubview(view)
    // Centre the creative inside the host (which is either sized from
    // `didChangeSize` or a fixed frame that may be larger than the creative).
    NSLayoutConstraint.activate([
      view.centerXAnchor.constraint(equalTo: entry.host.centerXAnchor),
      view.centerYAnchor.constraint(equalTo: entry.host.centerYAnchor),
    ])
    entry.banner = view
    if entry.sizes.isEmpty { view.loadAd() } else { view.loadAd(sizes: entry.sizes) }
  }

  private final class BannerDelegate: NSObject, EzoicBannerViewDelegate {
    weak var manager: EzoicAdViewManager?
    let entry: Entry
    init(manager: EzoicAdViewManager, entry: Entry) {
      self.manager = manager
      self.entry = entry
    }
    func bannerViewDidLoad(_ bannerView: EzoicBannerView) { manager?.emitEvent(entry, "loaded") }
    func bannerView(_ bannerView: EzoicBannerView, didFailToLoadWithError error: EzoicError) {
      manager?.emitEvent(entry, "failed", ["message": error.localizedDescription, "code": error.code])
    }
    func bannerView(_ bannerView: EzoicBannerView, didChangeSize size: CGSize) {
      manager?.applyReportedSize(entry, size)
      manager?.emitEvent(entry, "sizeChanged", ["width": Double(size.width), "height": Double(size.height)])
    }
    func bannerViewDidRecordImpression(_ bannerView: EzoicBannerView) { manager?.emitEvent(entry, "impression") }
    func bannerViewDidRecordClick(_ bannerView: EzoicBannerView) { manager?.emitEvent(entry, "clicked") }
    func bannerViewWillPresentScreen(_ bannerView: EzoicBannerView) { manager?.emitEvent(entry, "opened") }
    func bannerViewDidDismissScreen(_ bannerView: EzoicBannerView) { manager?.emitEvent(entry, "closed") }
  }

  // MARK: - Outstream

  private func loadOutstream(_ entry: Entry) {
    let view = EzoicOutstreamAdView(adUnitIdentifier: entry.adUnitId)
    view.collapseOnNoFill = entry.collapseOnNoFill
    let proxy = OutstreamDelegate(manager: self, entry: entry)
    entry.delegateProxy = proxy
    view.delegate = proxy
    view.translatesAutoresizingMaskIntoConstraints = false
    entry.host.addSubview(view)
    NSLayoutConstraint.activate([
      view.topAnchor.constraint(equalTo: entry.host.topAnchor),
      view.leadingAnchor.constraint(equalTo: entry.host.leadingAnchor),
      view.trailingAnchor.constraint(equalTo: entry.host.trailingAnchor),
      view.bottomAnchor.constraint(equalTo: entry.host.bottomAnchor),
    ])
    entry.outstream = view
    view.loadAd()
  }

  private final class OutstreamDelegate: NSObject, EzoicOutstreamAdViewDelegate {
    weak var manager: EzoicAdViewManager?
    let entry: Entry
    init(manager: EzoicAdViewManager, entry: Entry) {
      self.manager = manager
      self.entry = entry
    }
    func outstreamViewDidLoad(_ outstreamView: EzoicOutstreamAdView) { manager?.emitEvent(entry, "loaded") }
    func outstreamView(_ outstreamView: EzoicOutstreamAdView, didFailToLoadWithError error: EzoicError) {
      manager?.emitEvent(entry, "failed", ["message": error.localizedDescription, "code": error.code])
    }
    func outstreamView(_ outstreamView: EzoicOutstreamAdView, didChangeSize size: CGSize) {
      manager?.applyReportedSize(entry, size)
      manager?.emitEvent(entry, "sizeChanged", ["width": Double(size.width), "height": Double(size.height)])
    }
    func outstreamViewDidRecordImpression(_ outstreamView: EzoicOutstreamAdView) { manager?.emitEvent(entry, "impression") }
    func outstreamViewDidRecordClick(_ outstreamView: EzoicOutstreamAdView) { manager?.emitEvent(entry, "clicked") }
    func outstreamViewWillPresentScreen(_ outstreamView: EzoicOutstreamAdView) { manager?.emitEvent(entry, "opened") }
    func outstreamViewDidDismissScreen(_ outstreamView: EzoicOutstreamAdView) { manager?.emitEvent(entry, "closed") }
  }

  // MARK: - Native

  private func loadNative(_ entry: Entry) {
    EzoicNativeAd.load(adUnitIdentifier: entry.adUnitId) { [weak self] result in
      guard let self = self else { return }
      // destroy() and this callback both run on main; a late ad for a
      // destroyed view is released, not rendered.
      if entry.destroyed {
        if case .success(let ad) = result { ad.destroy() }
        return
      }
      switch result {
      case .success(let ad):
        guard let gmaAd = ad.nativeAd else {
          ad.destroy()
          self.emitEvent(entry, "failed", ["message": "Native ad loaded without content", "code": 0])
          return
        }
        entry.nativeAd = ad
        // Delegate before rendering so the impression, which fires as soon as
        // the NativeAdView is displayed, is delivered.
        let proxy = NativeDelegate(manager: self, entry: entry)
        entry.delegateProxy = proxy
        ad.delegate = proxy
        let adView = EzoicNativeAdTemplate.render(gmaAd)
        entry.host.subviews.forEach { $0.removeFromSuperview() }
        entry.host.addSubview(adView)
        NSLayoutConstraint.activate([
          adView.topAnchor.constraint(equalTo: entry.host.topAnchor),
          adView.leadingAnchor.constraint(equalTo: entry.host.leadingAnchor),
          adView.trailingAnchor.constraint(equalTo: entry.host.trailingAnchor),
          adView.bottomAnchor.constraint(equalTo: entry.host.bottomAnchor),
        ])
        self.emitEvent(entry, "loaded")
      case .failure(let error):
        self.emitEvent(entry, "failed", ["message": error.localizedDescription, "code": error.code])
      }
    }
  }

  private final class NativeDelegate: NSObject, EzoicNativeAdDelegate {
    weak var manager: EzoicAdViewManager?
    let entry: Entry
    init(manager: EzoicAdViewManager, entry: Entry) {
      self.manager = manager
      self.entry = entry
    }
    func nativeAdDidRecordImpression(_ nativeAd: EzoicNativeAd) { manager?.emitEvent(entry, "impression") }
    func nativeAdDidRecordClick(_ nativeAd: EzoicNativeAd) { manager?.emitEvent(entry, "clicked") }
    func nativeAdWillPresentScreen(_ nativeAd: EzoicNativeAd) { manager?.emitEvent(entry, "opened") }
    func nativeAdDidDismissScreen(_ nativeAd: EzoicNativeAd) { manager?.emitEvent(entry, "closed") }
  }

  // MARK: - Events

  private func emitEvent(_ entry: Entry, _ type: String, _ extra: [String: Any] = [:]) {
    if entry.destroyed { return }
    var payload: [String: Any] = ["id": entry.id, "type": type]
    for (key, value) in extra { payload[key] = value }
    emit(payload)
  }
}
