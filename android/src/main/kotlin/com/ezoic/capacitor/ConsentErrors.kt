package com.ezoic.capacitor

import com.ezoic.ads.sdk.core.EzoicError
import com.ezoic.ads.sdk.privacy.cmp.CmpError

/** Code for a `ConsentOutcome.Failed` error that carries none. */
internal const val UNKNOWN_CONSENT_ERROR_CODE = -1

/**
 * The numeric code of a `ConsentOutcome.Failed` error. Through `EzoicAds` it
 * is an [EzoicError]; a [CmpError] carries the same codes.
 */
internal fun consentErrorCode(error: Exception): Int =
  (error as? EzoicError)?.code ?: (error as? CmpError)?.code ?: UNKNOWN_CONSENT_ERROR_CODE

internal fun consentErrorMessage(error: Exception): String =
  error.message?.takeIf { it.isNotEmpty() } ?: "Unknown error"
