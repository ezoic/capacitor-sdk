import UIKit
import GoogleMobileAds

/// Builds a template `NativeAdView` in code, matching the React Native and
/// Flutter wrappers (and the Android plugin): a header row (icon + headline /
/// advertiser), a `MediaView`, the body text and a call-to-action button.
/// Optional text/image assets are created and registered only when present,
/// but the `MediaView` is always built: on GMA 12 `NativeAd.mediaContent` is
/// non-optional and the media view is a required asset. `adView.nativeAd` is
/// assigned last, as GMA requires.
enum EzoicNativeAdTemplate {
  static func render(_ gmaAd: GoogleMobileAds.NativeAd) -> NativeAdView {
    let adView = NativeAdView()
    adView.translatesAutoresizingMaskIntoConstraints = false

    let mainStack = UIStackView()
    mainStack.axis = .vertical
    mainStack.spacing = 8
    mainStack.translatesAutoresizingMaskIntoConstraints = false

    let headerRow = UIStackView()
    headerRow.axis = .horizontal
    headerRow.spacing = 8
    headerRow.alignment = .center

    if let image = gmaAd.icon?.image {
      let iconView = UIImageView(image: image)
      iconView.translatesAutoresizingMaskIntoConstraints = false
      NSLayoutConstraint.activate([
        iconView.widthAnchor.constraint(equalToConstant: 40),
        iconView.heightAnchor.constraint(equalToConstant: 40),
      ])
      headerRow.addArrangedSubview(iconView)
      adView.iconView = iconView
    }

    let textColumn = UIStackView()
    textColumn.axis = .vertical

    if let headline = gmaAd.headline {
      let label = UILabel()
      label.text = headline
      label.font = .boldSystemFont(ofSize: 16)
      label.numberOfLines = 0
      textColumn.addArrangedSubview(label)
      adView.headlineView = label
    }

    if let advertiser = gmaAd.advertiser {
      let label = UILabel()
      label.text = advertiser
      label.font = .systemFont(ofSize: 12)
      textColumn.addArrangedSubview(label)
      adView.advertiserView = label
    }

    headerRow.addArrangedSubview(textColumn)
    mainStack.addArrangedSubview(headerRow)

    let mediaView = MediaView()
    mediaView.mediaContent = gmaAd.mediaContent
    mediaView.translatesAutoresizingMaskIntoConstraints = false
    // Priority 999 so a host shorter than the template's natural height breaks
    // this constraint instead of spamming unsatisfiable-constraint logs.
    let mediaHeight = mediaView.heightAnchor.constraint(equalToConstant: 175)
    mediaHeight.priority = UILayoutPriority(999)
    mediaHeight.isActive = true
    mainStack.addArrangedSubview(mediaView)
    adView.mediaView = mediaView

    if let body = gmaAd.body {
      let label = UILabel()
      label.text = body
      label.font = .systemFont(ofSize: 14)
      label.numberOfLines = 0
      mainStack.addArrangedSubview(label)
      adView.bodyView = label
    }

    if let cta = gmaAd.callToAction {
      let button = UIButton(type: .system)
      button.setTitle(cta, for: .normal)
      // The NativeAdView handles the tap; the button must not intercept it.
      button.isUserInteractionEnabled = false
      mainStack.addArrangedSubview(button)
      adView.callToActionView = button
    }

    adView.addSubview(mainStack)
    NSLayoutConstraint.activate([
      mainStack.topAnchor.constraint(equalTo: adView.topAnchor, constant: 8),
      mainStack.leadingAnchor.constraint(equalTo: adView.leadingAnchor, constant: 8),
      mainStack.trailingAnchor.constraint(equalTo: adView.trailingAnchor, constant: -8),
      mainStack.bottomAnchor.constraint(lessThanOrEqualTo: adView.bottomAnchor, constant: -8),
    ])

    adView.nativeAd = gmaAd
    return adView
  }
}
