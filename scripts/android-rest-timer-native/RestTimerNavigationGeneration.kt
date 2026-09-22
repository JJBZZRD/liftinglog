package com.anonymous.LiftingLog.notifications

import android.content.Context
import com.google.gson.Strictness
import com.google.gson.stream.JsonReader
import com.google.gson.stream.JsonToken
import com.google.gson.stream.JsonWriter
import java.io.IOException
import java.io.StringReader
import java.io.StringWriter
import java.util.UUID

class RestTimerNavigationGeneration(
  private val persistence: RestTimerRegistryPersistence,
  private val uuidFactory: () -> UUID = UUID::randomUUID
) {
  fun read(): String? = when (val value = persistence.read()) {
    RestTimerRegistryValue.Missing -> null
    is RestTimerRegistryValue.Present -> decode(value.json)
  }

  fun rotate(): String {
    val generation = "$GENERATION_PREFIX${uuidFactory()}"
    if (!GENERATION_PATTERN.matches(generation)) {
      throw RestTimerNavigationGenerationPersistenceException(
        "Generated rest-timer navigation generation is not a canonical UUID-v4"
      )
    }
    persistence.replace(encode(generation))
    val published = read()
    if (published != generation) {
      throw RestTimerNavigationGenerationPersistenceException(
        "Published rest-timer navigation generation differs from the requested value"
      )
    }
    return generation
  }

  fun matches(capturedGeneration: String?): Boolean {
    val currentGeneration = read()
    return if (currentGeneration == null) {
      capturedGeneration == null
    } else {
      capturedGeneration == currentGeneration
    }
  }

  private fun decode(json: String): String {
    try {
      requireStrictJsonCharacters(json)
      var versionSeen = false
      var generationSeen = false
      var generation: String? = null
      JsonReader(StringReader(json)).use { reader ->
        reader.strictness = Strictness.STRICT
        reader.beginObject()
        while (reader.hasNext()) {
          when (reader.nextName()) {
            "version" -> {
              if (versionSeen || readIntegerToken(reader) != RECORD_VERSION.toLong()) {
                throw RestTimerNavigationGenerationCorruptException()
              }
              versionSeen = true
            }
            "generation" -> {
              if (generationSeen || reader.peek() != JsonToken.STRING) {
                throw RestTimerNavigationGenerationCorruptException()
              }
              generation = reader.nextString()
              generationSeen = true
            }
            else -> throw RestTimerNavigationGenerationCorruptException()
          }
        }
        reader.endObject()
        val resolvedGeneration = generation
        if (
          reader.peek() != JsonToken.END_DOCUMENT ||
          !versionSeen ||
          !generationSeen ||
          resolvedGeneration == null ||
          !GENERATION_PATTERN.matches(resolvedGeneration)
        ) {
          throw RestTimerNavigationGenerationCorruptException()
        }
        return resolvedGeneration
      }
    } catch (error: RestTimerNavigationGenerationCorruptException) {
      throw error
    } catch (error: Exception) {
      throw RestTimerNavigationGenerationCorruptException(error)
    }
  }

  private fun encode(generation: String): String {
    val output = StringWriter()
    JsonWriter(output).use { writer ->
      writer.beginObject()
      writer.name("version").value(RECORD_VERSION)
      writer.name("generation").value(generation)
      writer.endObject()
    }
    return output.toString()
  }

  private fun readIntegerToken(reader: JsonReader): Long {
    if (reader.peek() != JsonToken.NUMBER) {
      throw RestTimerNavigationGenerationCorruptException()
    }
    val token = reader.nextString()
    if (!INTEGER_PATTERN.matches(token)) {
      throw RestTimerNavigationGenerationCorruptException()
    }
    return token.toLongOrNull() ?: throw RestTimerNavigationGenerationCorruptException()
  }

  private fun requireStrictJsonCharacters(json: String) {
    var insideString = false
    var escaped = false
    for (character in json) {
      if (!insideString) {
        if (character == '\uFEFF') {
          throw RestTimerNavigationGenerationCorruptException()
        }
        if (character == '"') {
          insideString = true
        }
        continue
      }

      if (character.code <= 0x1f) {
        throw RestTimerNavigationGenerationCorruptException()
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

  companion object {
    const val GENERATION_PREFIX = "timer-nav-v1:"
    private const val RECORD_VERSION = 1
    private val INTEGER_PATTERN = Regex("-?(0|[1-9][0-9]*)")
    val GENERATION_PATTERN = Regex(
      "^timer-nav-v1:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
    )

    fun from(context: Context): RestTimerNavigationGeneration = RestTimerNavigationGeneration(
      AtomicFileRestTimerRegistryPersistence.navigationGeneration(context)
    )
  }
}

class RestTimerNavigationRetirementCoordinator(
  private val generation: RestTimerNavigationGeneration,
  private val registry: RestTimerRegistry
) {
  fun retire(
    cancelAlarm: (RegisteredRestTimer) -> Unit,
    clearProcessState: () -> Unit,
    clearDisplayedNotifications: () -> Unit
  ): RestTimerRetirementResult {
    generation.rotate()
    return registry.retire(cancelAlarm, clearProcessState, clearDisplayedNotifications)
  }
}

class RestTimerNavigationGenerationCorruptException(
  cause: Throwable? = null
) : IOException("The rest-timer navigation generation is corrupt", cause)

class RestTimerNavigationGenerationPersistenceException(
  message: String,
  cause: Throwable? = null
) : IOException(message, cause)
