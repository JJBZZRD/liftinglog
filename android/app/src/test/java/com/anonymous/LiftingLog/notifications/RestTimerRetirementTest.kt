package com.anonymous.LiftingLog.notifications

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.IOException

class RestTimerRetirementTest {
  @Test
  fun fileCodecRejectsInvalidUtf8OversizeAndUnpairedSurrogates() {
    assertThrows(RestTimerRegistryCorruptException::class.java) {
      RestTimerRegistryFileCodec.decode(byteArrayOf(0xc3.toByte(), 0x28))
    }
    assertThrows(RestTimerRegistryPersistenceException::class.java) {
      RestTimerRegistryFileCodec.decode(
        ByteArray(RestTimerRegistryFileCodec.MAX_REGISTRY_BYTES + 1)
      )
    }
    val unpairedSurrogate = String(charArrayOf(0xd800.toChar()))
    assertThrows(RestTimerRegistryPersistenceException::class.java) {
      RestTimerRegistryFileCodec.encode("{\"value\":\"$unpairedSurrogate\"}")
    }
  }

  @Test
  fun persistedIdentitySurvivesRegistryRecreation() {
    val persistence = MemoryPersistence()
    val timer = timer(timerId = "timer-process", exerciseId = 42, endAtMillis = 123_456L)

    RestTimerRegistry(persistence).register(timer)
    val recreatedRegistry = RestTimerRegistry(persistence)

    assertEquals(timer, recreatedRegistry.findExact("timer-process", 42, 123_456L))
  }

  @Test
  fun staleAndLegacyDeliveriesDoNotMatchTheRegistry() {
    val persistence = MemoryPersistence()
    RestTimerRegistry(persistence).register(timer())
    val recreatedRegistry = RestTimerRegistry(persistence)

    assertNull(recreatedRegistry.findExact("old-timer", 7, 50_000L))
    assertNull(recreatedRegistry.findExact("timer-1", 8, 50_000L))
    assertNull(recreatedRegistry.findExact("timer-1", 7, 50_001L))
    assertNull(RestTimerRegistry(MemoryPersistence()).findExact("timer-1", 7, 50_000L))
  }

  @Test
  fun malformedRegistryFailsClosed() {
    val valid = "{\"version\":1,\"timers\":[{\"timerId\":\"timer-1\",\"exerciseId\":7," +
      "\"exerciseName\":\"Bench\",\"endAt\":50000}]}"
    val malformedValues = listOf(
      "not-json",
      "{}",
      "{\"version\":1,\"timers\":{}}",
      "\uFEFF$valid",
      valid.replace("Bench", "Ben\u0000ch"),
      "{\"version\":1,\"timers\":[{\"timerId\":\"timer-1\",\"exerciseId\":7," +
        "\"exerciseName\":\"Bench\",\"endAt\":50000.5}]}",
      "{\"version\":1,\"timers\":[{\"timerId\":\"timer-1\",\"exerciseId\":7," +
        "\"exerciseName\":\"Bench\",\"endAt\":50000},{\"timerId\":\"timer-2\"," +
        "\"exerciseId\":7,\"exerciseName\":\"Squat\",\"endAt\":60000}]}"
    )

    malformedValues.forEach { json ->
      assertThrows(json, RestTimerRegistryCorruptException::class.java) {
        RestTimerRegistry(MemoryPersistence(RestTimerRegistryValue.Present(json))).readAll()
      }
    }
  }

  @Test
  fun registrationAndRetirementRejectCheckedPersistenceFailures() {
    val registerPersistence = MemoryPersistence()
    RestTimerRegistry(registerPersistence).register(timer(timerId = "old-timer"))
    registerPersistence.failReplace = true
    assertThrows(RestTimerRegistryPersistenceException::class.java) {
      RestTimerRegistry(registerPersistence).register(timer())
    }
    assertEquals(
      "old-timer",
      RestTimerRegistry(registerPersistence).readAll().single().timerId
    )

    val retirePersistence = MemoryPersistence()
    val registry = RestTimerRegistry(retirePersistence)
    registry.register(timer())
    retirePersistence.failRemoveLeavingBackup = true
    var processStateCleared = false
    var notificationsCleared = false

    assertThrows(RestTimerRegistryPersistenceException::class.java) {
      registry.retire(
        cancelAlarm = {},
        clearProcessState = { processStateCleared = true },
        clearDisplayedNotifications = { notificationsCleared = true }
      )
    }
    assertFalse(processStateCleared)
    assertFalse(notificationsCleared)
    assertEquals(1, RestTimerRegistry(retirePersistence).readAll().size)

    retirePersistence.failRemoveLeavingBackup = false
    var retryAlarmCancellationCount = 0
    val retry = RestTimerRegistry(retirePersistence).retire(
      cancelAlarm = { retryAlarmCancellationCount += 1 },
      clearProcessState = {},
      clearDisplayedNotifications = {}
    )
    assertEquals(1, retry.registeredTimersRetired)
    assertEquals(1, retryAlarmCancellationCount)
    assertTrue(retirePersistence.read() is RestTimerRegistryValue.Missing)
  }

  @Test
  fun registryInspectionFailureDoesNotCancelOrClearAnything() {
    val persistence = MemoryPersistence().apply { failRead = true }
    var alarmCancelled = false
    var processStateCleared = false
    var notificationsCleared = false

    assertThrows(IOException::class.java) {
      RestTimerRegistry(persistence).retire(
        cancelAlarm = { alarmCancelled = true },
        clearProcessState = { processStateCleared = true },
        clearDisplayedNotifications = { notificationsCleared = true }
      )
    }
    assertFalse(alarmCancelled)
    assertFalse(processStateCleared)
    assertFalse(notificationsCleared)
  }

  @Test
  fun unpublishedNewFileIsNotTreatedAsPhysicalAbsence() {
    val persistence = MemoryPersistence().apply {
      seedUnpublishedNew("{\"version\":1,\"timers\":[]}")
    }

    assertThrows(IOException::class.java) {
      RestTimerRegistry(persistence).readAll()
    }
  }

  @Test
  fun failedBackupRecoveryNeverExposesTheNonAuthoritativeBase() {
    val persistence = MemoryPersistence()
    RestTimerRegistry(persistence).register(timer(timerId = "authoritative-old"))
    val nonAuthoritative = MemoryPersistence().also {
      RestTimerRegistry(it).register(timer(timerId = "uncommitted-new"))
    }.committedJson()
    persistence.seedBaseWithAuthoritativeBackup(nonAuthoritative)
    persistence.failBackupRecovery = true

    assertThrows(RestTimerRegistryPersistenceException::class.java) {
      RestTimerRegistry(persistence).readAll()
    }

    persistence.failBackupRecovery = false
    assertEquals(
      "authoritative-old",
      RestTimerRegistry(persistence).readAll().single().timerId
    )
    assertFalse(persistence.hasBackup())
  }

  @Test
  fun failedOrphanedNewCleanupRejectsUntilThePostconditionCanBeMet() {
    val persistence = MemoryPersistence()
    RestTimerRegistry(persistence).register(timer(timerId = "committed"))
    persistence.seedOrphanedNewKeepingBase("unpublished")
    persistence.failNewCleanup = true

    assertThrows(RestTimerRegistryPersistenceException::class.java) {
      RestTimerRegistry(persistence).readAll()
    }

    persistence.failNewCleanup = false
    assertEquals("committed", RestTimerRegistry(persistence).readAll().single().timerId)
  }

  @Test
  fun alarmCancellationFailureLeavesRegistryRetryable() {
    val persistence = MemoryPersistence()
    val registry = RestTimerRegistry(persistence)
    registry.register(timer())
    var processStateCleared = false
    var notificationsCleared = false

    assertThrows(IllegalStateException::class.java) {
      registry.retire(
        cancelAlarm = { throw IllegalStateException("cancel failed") },
        clearProcessState = { processStateCleared = true },
        clearDisplayedNotifications = { notificationsCleared = true }
      )
    }
    assertFalse(processStateCleared)
    assertFalse(notificationsCleared)
    assertEquals(1, RestTimerRegistry(persistence).readAll().size)

    val retry = RestTimerRegistry(persistence).retire({}, {}, {})
    assertEquals(1, retry.registeredTimersRetired)
  }

  @Test
  fun notificationCancellationFailureLeavesRegistryRetiredForSafeRetry() {
    val persistence = MemoryPersistence()
    RestTimerRegistry(persistence).register(timer())

    assertThrows(IllegalStateException::class.java) {
      RestTimerRegistry(persistence).retire(
        cancelAlarm = {},
        clearProcessState = {},
        clearDisplayedNotifications = { throw IllegalStateException("cancelAll failed") }
      )
    }
    assertTrue(persistence.read() is RestTimerRegistryValue.Missing)

    var notificationsCleared = false
    val retry = RestTimerRegistry(persistence).retire(
      cancelAlarm = { throw AssertionError("No alarm should remain registered") },
      clearProcessState = {},
      clearDisplayedNotifications = { notificationsCleared = true }
    )
    assertEquals(0, retry.registeredTimersRetired)
    assertTrue(notificationsCleared)
  }

  @Test
  fun retirementIsIdempotentAndCancelsEveryRegisteredIdentity() {
    val persistence = MemoryPersistence()
    val registry = RestTimerRegistry(persistence)
    registry.register(timer(timerId = "timer-1", exerciseId = 7))
    registry.register(timer(timerId = "timer-2", exerciseId = 9))
    val cancelled = mutableListOf<String>()
    var processClearCount = 0
    var notificationClearCount = 0

    val first = registry.retire(
      cancelAlarm = { cancelled += it.timerId },
      clearProcessState = { processClearCount += 1 },
      clearDisplayedNotifications = { notificationClearCount += 1 }
    )
    val second = RestTimerRegistry(persistence).retire(
      cancelAlarm = { throw AssertionError("No alarm should remain registered") },
      clearProcessState = { processClearCount += 1 },
      clearDisplayedNotifications = { notificationClearCount += 1 }
    )

    assertEquals(listOf("timer-1", "timer-2"), cancelled)
    assertEquals(2, first.registeredTimersRetired)
    assertEquals(0, second.registeredTimersRetired)
    assertEquals(2, processClearCount)
    assertEquals(2, notificationClearCount)
  }

  private fun timer(
    timerId: String = "timer-1",
    exerciseId: Int = 7,
    endAtMillis: Long = 50_000L
  ) = RegisteredRestTimer(
    timerId = timerId,
    exerciseId = exerciseId,
    exerciseName = "Bench Press",
    endAtMillis = endAtMillis
  )

  private class MemoryPersistence(
    initialValue: RestTimerRegistryValue = RestTimerRegistryValue.Missing
  ) : RestTimerRegistryPersistence {
    var failReplace = false
    var failRemoveLeavingBackup = false
    var failBackupRecovery = false
    var failNewCleanup = false
    var failRead = false
    private var primaryJson: String? = (initialValue as? RestTimerRegistryValue.Present)?.json
    private var backupJson: String? = null
    private var unpublishedNewJson: String? = null

    override fun read(): RestTimerRegistryValue {
      if (failRead) {
        throw IOException("read failed")
      }
      if (backupJson != null) {
        if (failBackupRecovery) {
          throw RestTimerRegistryPersistenceException(
            "backup recovery failed before the base could be trusted"
          )
        }
        primaryJson = backupJson
        backupJson = null
      }
      if (primaryJson != null) {
        if (unpublishedNewJson != null) {
          if (failNewCleanup) {
            throw RestTimerRegistryPersistenceException(
              "new-file cleanup failed before the base could be trusted"
            )
          }
          unpublishedNewJson = null
        }
        return RestTimerRegistryValue.Present(primaryJson!!)
      }
      if (unpublishedNewJson != null) {
        throw IOException("unpublished .new state is not absence")
      }
      return RestTimerRegistryValue.Missing
    }

    override fun replace(json: String) {
      if (failReplace) {
        throw RestTimerRegistryPersistenceException("write failed")
      }
      unpublishedNewJson = json
      backupJson = primaryJson
      primaryJson = unpublishedNewJson
      unpublishedNewJson = null
      backupJson = null
    }

    override fun remove() {
      if (failRemoveLeavingBackup) {
        backupJson = primaryJson ?: backupJson
        primaryJson = null
        throw RestTimerRegistryPersistenceException("delete left .bak state")
      }
      primaryJson = null
      backupJson = null
      unpublishedNewJson = null
    }

    fun seedUnpublishedNew(json: String) {
      primaryJson = null
      backupJson = null
      unpublishedNewJson = json
    }

    fun committedJson(): String = primaryJson
      ?: throw IllegalStateException("Expected a committed primary registry")

    fun seedBaseWithAuthoritativeBackup(nonAuthoritativePrimaryJson: String) {
      backupJson = committedJson()
      primaryJson = nonAuthoritativePrimaryJson
    }

    fun seedOrphanedNewKeepingBase(json: String) {
      unpublishedNewJson = json
    }

    fun hasBackup(): Boolean = backupJson != null
  }
}
