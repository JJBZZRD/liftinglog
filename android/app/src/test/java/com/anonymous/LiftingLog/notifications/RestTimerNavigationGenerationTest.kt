package com.anonymous.LiftingLog.notifications

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.IOException
import java.util.UUID

class RestTimerNavigationGenerationTest {
  @Test
  fun physicalAbsenceIsTheOnlyLegacyStateAndRepeatedReadsRemainAbsent() {
    val generation = RestTimerNavigationGeneration(MemoryPersistence())

    assertNull(generation.read())
    assertNull(generation.read())
    assertTrue(generation.matches(null))
    assertFalse(generation.matches(CURRENT_GENERATION))
  }

  @Test
  fun rotationPublishesCanonicalGenerationThatSurvivesObjectRecreation() {
    val persistence = MemoryPersistence()
    val generation = RestTimerNavigationGeneration(persistence) { currentUuid() }

    assertEquals(CURRENT_GENERATION, generation.rotate())
    assertEquals(CURRENT_GENERATION, generation.read())
    assertEquals(CURRENT_GENERATION, RestTimerNavigationGeneration(persistence).read())
  }

  @Test
  fun staleCurrentAndMissingCapturedLinksFollowStrictGenerationPolicy() {
    val persistence = MemoryPersistence()
    val generation = RestTimerNavigationGeneration(persistence) { currentUuid() }
    generation.rotate()

    assertTrue(generation.matches(CURRENT_GENERATION))
    assertFalse(generation.matches(STALE_GENERATION))
    assertFalse(generation.matches(null))
  }

  @Test
  fun completionLinkRemainsCurrentAfterItsRegistryIdentityIsRemoved() {
    val generationPersistence = MemoryPersistence()
    val generation = RestTimerNavigationGeneration(generationPersistence) { currentUuid() }
    val registryPersistence = MemoryPersistence()
    val registry = RestTimerRegistry(registryPersistence)
    val timer = RegisteredRestTimer("timer-1", 7, "Bench Press", 50_000L)
    registry.register(timer)
    val capturedGeneration = generation.rotate()

    assertEquals(timer, registry.removeExact("timer-1", 7, 50_000L))
    assertTrue(registryPersistence.read() is RestTimerRegistryValue.Missing)
    assertTrue(RestTimerNavigationGeneration(generationPersistence).matches(capturedGeneration))
  }

  @Test
  fun rotationStillOccursWithAnEmptyRegistryAndEveryRetirementGetsANewValue() {
    val generations = listOf(currentUuid(), staleUuid()).iterator()
    val generationPersistence = MemoryPersistence()
    val generation = RestTimerNavigationGeneration(generationPersistence) { generations.next() }
    val coordinator = RestTimerNavigationRetirementCoordinator(
      generation,
      RestTimerRegistry(MemoryPersistence())
    )

    assertEquals(0, coordinator.retire({}, {}, {}).registeredTimersRetired)
    assertEquals(CURRENT_GENERATION, generation.read())
    assertEquals(0, coordinator.retire({}, {}, {}).registeredTimersRetired)
    assertEquals(STALE_GENERATION, generation.read())
    assertFalse(generation.matches(CURRENT_GENERATION))
  }

  @Test
  fun malformedGenerationRecordsFailClosed() {
    val malformed = listOf(
      "not-json",
      "{}",
      "{\"version\":1}",
      "{\"version\":1,\"generation\":null}",
      "{\"version\":1,\"generation\":\"\"}",
      "{\"version\":1,\"generation\":\"timer-nav-v1:123E4567-E89B-42D3-A456-426614174000\"}",
      "{\"version\":1,\"generation\":\"timer-nav-v1:123e4567-e89b-12d3-a456-426614174000\"}",
      "{\"version\":1,\"generation\":\"$CURRENT_GENERATION\",\"extra\":true}",
      "{\"version\":1,\"version\":1,\"generation\":\"$CURRENT_GENERATION\"}",
      "\uFEFF{\"version\":1,\"generation\":\"$CURRENT_GENERATION\"}",
      "{\"version\":1.0,\"generation\":\"$CURRENT_GENERATION\"}"
    )

    malformed.forEach { json ->
      assertThrows(json, RestTimerNavigationGenerationCorruptException::class.java) {
        RestTimerNavigationGeneration(
          MemoryPersistence(RestTimerRegistryValue.Present(json))
        ).read()
      }
    }
  }

  @Test
  fun injectedInaccessibleAndRecoveryFailuresNeverBecomeLegacy() {
    listOf(
      "generation path is a directory",
      "unpublished .new state",
      "backup recovery failed",
      "orphaned .new cleanup failed"
    ).forEach { message ->
      val persistence = MemoryPersistence().apply { readFailure = IOException(message) }
      assertThrows(IOException::class.java) {
        RestTimerNavigationGeneration(persistence).read()
      }
    }
  }

  @Test
  fun failedReadbackRejectsRotationAndDoesNotRetireTimers() {
    val generationPersistence = MemoryPersistence().apply { publishDifferentValue = true }
    val generation = RestTimerNavigationGeneration(generationPersistence) { currentUuid() }
    val registryPersistence = MemoryPersistence()
    val registry = RestTimerRegistry(registryPersistence)
    registry.register(RegisteredRestTimer("timer-1", 7, "Bench Press", 50_000L))
    var alarmCancelled = false
    var processCleared = false
    var notificationsCleared = false

    assertThrows(RestTimerNavigationGenerationPersistenceException::class.java) {
      RestTimerNavigationRetirementCoordinator(generation, registry).retire(
        cancelAlarm = { alarmCancelled = true },
        clearProcessState = { processCleared = true },
        clearDisplayedNotifications = { notificationsCleared = true }
      )
    }
    assertFalse(alarmCancelled)
    assertFalse(processCleared)
    assertFalse(notificationsCleared)
    assertEquals(1, RestTimerRegistry(registryPersistence).readAll().size)
  }

  @Test
  fun retirementFailureLeavesRotatedGenerationAndRetryRotatesAgain() {
    val generations = listOf(currentUuid(), staleUuid()).iterator()
    val generation = RestTimerNavigationGeneration(MemoryPersistence()) { generations.next() }
    val registryPersistence = MemoryPersistence()
    val registry = RestTimerRegistry(registryPersistence)
    registry.register(RegisteredRestTimer("timer-1", 7, "Bench Press", 50_000L))
    val coordinator = RestTimerNavigationRetirementCoordinator(generation, registry)

    assertThrows(IllegalStateException::class.java) {
      coordinator.retire(
        cancelAlarm = { throw IllegalStateException("cancel failed") },
        clearProcessState = {},
        clearDisplayedNotifications = {}
      )
    }
    assertEquals(CURRENT_GENERATION, generation.read())
    assertEquals(1, registry.readAll().size)

    assertEquals(1, coordinator.retire({}, {}, {}).registeredTimersRetired)
    assertEquals(STALE_GENERATION, generation.read())
  }

  private fun currentUuid(): UUID = UUID.fromString(CURRENT_GENERATION.removePrefix(PREFIX))

  private fun staleUuid(): UUID = UUID.fromString(STALE_GENERATION.removePrefix(PREFIX))

  private class MemoryPersistence(
    initialValue: RestTimerRegistryValue = RestTimerRegistryValue.Missing
  ) : RestTimerRegistryPersistence {
    private var value = initialValue
    var readFailure: IOException? = null
    var publishDifferentValue = false

    override fun read(): RestTimerRegistryValue {
      readFailure?.let { throw it }
      return value
    }

    override fun replace(json: String) {
      value = if (publishDifferentValue) {
        RestTimerRegistryValue.Present(
          "{\"version\":1,\"generation\":\"$STALE_GENERATION\"}"
        )
      } else {
        RestTimerRegistryValue.Present(json)
      }
    }

    override fun remove() {
      value = RestTimerRegistryValue.Missing
    }
  }

  companion object {
    private const val PREFIX = "timer-nav-v1:"
    private const val CURRENT_GENERATION =
      "timer-nav-v1:123e4567-e89b-42d3-a456-426614174000"
    private const val STALE_GENERATION =
      "timer-nav-v1:223e4567-e89b-42d3-a456-426614174000"
  }
}
