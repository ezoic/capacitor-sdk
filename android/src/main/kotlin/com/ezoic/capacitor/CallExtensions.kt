package com.ezoic.capacitor

import com.ezoic.ads.sdk.core.EzoicError
import com.getcapacitor.JSObject
import com.getcapacitor.PluginCall

/** Code used for plugin-side (non-native) rejections. */
internal const val PLUGIN_ERROR_CODE = "EzoicAds"

/**
 * Rejects a call with a native [EzoicError]: the numeric code becomes both the
 * string `code` and `data.code` (JS: `getEzoicErrorCode(error)`). Other
 * throwables reject with the generic plugin code.
 */
internal fun PluginCall.rejectEzoic(e: Throwable, fallbackMessage: String) {
  val message = e.message?.takeIf { it.isNotEmpty() } ?: fallbackMessage
  val error = e as? EzoicError
  if (error != null) {
    val data = JSObject().put("code", error.code)
    reject(message, error.code.toString(), null, data)
  } else {
    reject(message, PLUGIN_ERROR_CODE, e as? Exception)
  }
}

/** Rejects with a plugin-side validation message. */
internal fun PluginCall.rejectPlugin(message: String) {
  reject(message, PLUGIN_ERROR_CODE)
}

/** Reads an optional boolean (missing/null → default). */
internal fun PluginCall.optBoolean(key: String, default: Boolean): Boolean =
  if (data.has(key) && !data.isNull(key)) data.getBoolean(key) else default

/** Reads an optional non-empty string. */
internal fun PluginCall.optString(key: String): String? =
  getString(key)?.takeIf { it.isNotEmpty() }

internal fun JSObject.optIntOrNull(key: String): Int? =
  if (has(key) && !isNull(key)) optDouble(key).takeIf { !it.isNaN() }?.toInt() else null

internal fun errorPayload(message: String?, code: Int): JSObject =
  JSObject().put("message", message ?: "").put("code", code)
