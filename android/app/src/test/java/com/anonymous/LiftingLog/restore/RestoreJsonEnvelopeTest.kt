package com.anonymous.LiftingLog.restore

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class RestoreJsonEnvelopeTest {
  @Test
  fun acceptsStrictNestedObjectsAndPreservesTheExactInput() {
    val json = " \r\n{\"nested\":{\"array\":[true,false,null,-0.25e+2]}," +
      "\"unicode\":\"snowman ☃ and 😃\"," +
      "\"escaped\":\"\\u2603\\/\\uD83D\\uDE03\"}\t "
    val escapedState = """{"slashes":"\\\\","quote":"\""}"""

    assertEquals(json, RestoreJsonEnvelope.requireObject(json))
    assertEquals(escapedState, RestoreJsonEnvelope.requireObject(escapedState))
  }

  @Test
  fun rejectsLenientObjectSyntax() {
    val invalid = listOf(
      "{foo:'bar'}",
      "{// comment\n\"value\":1}",
      "{/* comment */\"value\":1}",
      "{# comment\n\"value\":1}",
      "{\"value\":0x10}",
      "{\"value\":010}",
      "{\"value\"=1}",
      "{\"value\"=>1}",
      "{\"value\":1;\"next\":2}",
      "{\"value\":'single quoted'}",
      "{\"value\":\"\\x41\"}",
      "{\"value\":\"\\'\"}",
      "{\"value\":\"\\u12G4\"}",
      "{\"value\":\"line\nbreak\"}",
      "{\"value\":\"tab\tcharacter\"}",
      "{\"value\":\"null\u0000character\"}",
      "\uFEFF{\"value\":1}",
    )

    invalid.forEach { json ->
      assertThrows(json, InvalidRestoreJsonObjectException::class.java) {
        RestoreJsonEnvelope.requireObject(json)
      }
    }
  }

  @Test
  fun rejectsInvalidLiteralsNumbersAndIncompleteInput() {
    val invalid = listOf(
      "{\"value\":TRUE}",
      "{\"value\":False}",
      "{\"value\":NULL}",
      "{\"value\":1.}",
      "{\"value\":.5}",
      "{\"value\":+1}",
      "{\"value\":1e}",
      "{\"value\":NaN}",
      "{\"value\":Infinity}",
      "{\"value\":1,}",
      "{}{}",
      "{} trailing",
      "{\"unterminated\":",
    )

    invalid.forEach { json ->
      assertThrows(json, InvalidRestoreJsonObjectException::class.java) {
        RestoreJsonEnvelope.requireObject(json)
      }
    }
  }

  @Test
  fun rejectsNonObjectJsonValues() {
    listOf("[]", "null", "true", "1", "\"text\"").forEach { json ->
      assertThrows(json, InvalidRestoreJsonObjectException::class.java) {
        RestoreJsonEnvelope.requireObject(json)
      }
    }
  }
}
