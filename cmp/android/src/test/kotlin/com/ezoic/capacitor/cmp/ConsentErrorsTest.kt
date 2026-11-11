package com.ezoic.capacitor.cmp

import com.ezoic.ads.sdk.privacy.cmp.CmpError
import org.junit.Assert.assertEquals
import org.junit.Test

class ConsentErrorsTest {
  @Test
  fun cmpErrorKeepsItsCode() {
    assertEquals(1001, consentErrorCode(CmpError.NotInitialized))
    assertEquals(2001, consentErrorCode(CmpError.Network(null)))
    assertEquals(4001, consentErrorCode(CmpError.Render("x")))
    assertEquals(5002, consentErrorCode(CmpError.InvalidConsent("x")))
  }

  @Test
  fun otherExceptionFallsBackToMinusOne() {
    val error = IllegalStateException("boom")
    assertEquals(-1, consentErrorCode(error))
    assertEquals("boom", consentErrorMessage(error))
    assertEquals("Unknown error", consentErrorMessage(RuntimeException()))
  }
}
