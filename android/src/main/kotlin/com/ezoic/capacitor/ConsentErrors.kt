package com.ezoic.capacitor

import com.ezoic.ads.sdk.core.EzoicError

/** Code for a `ConsentOutcome.Failed` error that carries none. */
internal const val UNKNOWN_CONSENT_ERROR_CODE = -1

/**
 * The numeric code of a `ConsentOutcome.Failed` error. Through `EzoicAds` it
 * is always an [EzoicError] (the SDK maps the CMP's errors to it, same codes).
 * Never refer to the CMP's `CmpError` here: apps may exclude ezoic-cmp-sdk,
 * and this plugin must not reference any class that lives only there.
 */
internal fun consentErrorCode(error: Exception): Int =
  (error as? EzoicError)?.code ?: UNKNOWN_CONSENT_ERROR_CODE

internal fun consentErrorMessage(error: Exception): String =
  error.message?.takeIf { it.isNotEmpty() } ?: "Unknown error"
