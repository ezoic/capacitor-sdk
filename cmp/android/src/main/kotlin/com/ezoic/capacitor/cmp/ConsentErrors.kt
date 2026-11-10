package com.ezoic.capacitor.cmp

import com.ezoic.ads.sdk.privacy.cmp.CmpError

/** Code for a `ConsentOutcome.Failed` error that carries none. */
internal const val UNKNOWN_CONSENT_ERROR_CODE = -1

/** The numeric code of a `ConsentOutcome.Failed` error; from `EzoicCmp` it is a [CmpError]. */
internal fun consentErrorCode(error: Exception): Int =
  (error as? CmpError)?.code ?: UNKNOWN_CONSENT_ERROR_CODE

internal fun consentErrorMessage(error: Exception): String =
  error.message?.takeIf { it.isNotEmpty() } ?: "Unknown error"
