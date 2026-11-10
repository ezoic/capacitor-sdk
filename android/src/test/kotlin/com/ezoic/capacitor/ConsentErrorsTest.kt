package com.ezoic.capacitor

import com.ezoic.ads.sdk.core.EzoicError
import com.ezoic.ads.sdk.privacy.cmp.CmpError
import org.junit.Assert.assertEquals
import org.junit.Test

class ConsentErrorsTest {
  @Test
  fun ezoicErrorKeepsItsCode() {
    assertEquals(1001, consentErrorCode(EzoicError.NotInitialized))
  }

  @Test
  fun cmpErrorKeepsItsCode() {
    assertEquals(1001, consentErrorCode(CmpError.NotInitialized))
    assertEquals(4001, consentErrorCode(CmpError.Render("x")))
    assertEquals(5002, consentErrorCode(CmpError.InvalidConsent("x")))
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
