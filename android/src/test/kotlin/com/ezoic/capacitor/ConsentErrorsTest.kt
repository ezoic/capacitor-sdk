package com.ezoic.capacitor

import com.ezoic.ads.sdk.core.EzoicError
import org.junit.Assert.assertEquals
import org.junit.Test

class ConsentErrorsTest {
  @Test
  fun ezoicErrorKeepsItsCode() {
    assertEquals(1001, consentErrorCode(EzoicError.NotInitialized))
    assertEquals(2001, consentErrorCode(EzoicError.NetworkError(null)))
    assertEquals(4001, consentErrorCode(EzoicError.RenderError("x")))
    assertEquals(5002, consentErrorCode(EzoicError.InvalidConsent("x")))
  }

  @Test
  fun otherExceptionFallsBackToMinusOne() {
    val error = IllegalStateException("boom")
    assertEquals(-1, consentErrorCode(error))
    assertEquals("boom", consentErrorMessage(error))
  }

  @Test
  fun blankMessageFallsBack() {
    assertEquals("Unknown error", consentErrorMessage(RuntimeException()))
    assertEquals("Unknown error", consentErrorMessage(RuntimeException("")))
  }
}
