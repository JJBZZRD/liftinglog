package com.anonymous.LiftingLog.restore

import com.google.gson.Strictness
import com.google.gson.stream.JsonReader
import com.google.gson.stream.JsonToken
import java.io.IOException
import java.io.StringReader

internal object RestoreJsonEnvelope {
  fun requireObject(json: String): String {
    try {
      requireStrictStringCharacters(json)
      JsonReader(StringReader(json)).use { reader ->
        reader.strictness = Strictness.STRICT
        if (reader.peek() != JsonToken.BEGIN_OBJECT) {
          throw InvalidRestoreJsonObjectException()
        }
        reader.skipValue()
        if (reader.peek() != JsonToken.END_DOCUMENT) {
          throw InvalidRestoreJsonObjectException()
        }
      }
    } catch (error: InvalidRestoreJsonObjectException) {
      throw error
    } catch (error: Exception) {
      throw InvalidRestoreJsonObjectException(error)
    }
    return json
  }

  private fun requireStrictStringCharacters(json: String) {
    var insideString = false
    var escaped = false
    for (character in json) {
      if (!insideString) {
        if (character == '\uFEFF') {
          throw InvalidRestoreJsonObjectException()
        }
        if (character == '"') {
          insideString = true
        }
        continue
      }

      if (character.code <= 0x1f) {
        throw InvalidRestoreJsonObjectException()
      }
      if (escaped) {
        escaped = false
      } else if (character == '\\') {
        escaped = true
      } else if (character == '"') {
        insideString = false
      }
    }
  }
}

internal class InvalidRestoreJsonObjectException(
  cause: Throwable? = null
) : IOException(cause)
