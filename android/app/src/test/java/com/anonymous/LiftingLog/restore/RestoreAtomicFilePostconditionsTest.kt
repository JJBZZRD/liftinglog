package com.anonymous.LiftingLog.restore

import java.io.ByteArrayInputStream
import java.nio.charset.StandardCharsets
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class RestoreAtomicFilePostconditionsTest {
  @Test
  fun failedBackupRecoveryClosesTheStreamAndRetryReturnsTheBackup() {
    val events = mutableListOf<String>()
    var parentWritable = false
    var base = "NEW"
    var backup: String? = "OLD"
    var attempt = 0

    fun openLikeAtomicFile(): TrackingInputStream {
      attempt += 1
      events += "open$attempt"
      if (parentWritable && backup != null) {
        base = requireNotNull(backup)
        backup = null
        events += "recover$attempt"
      }
      return TrackingInputStream(base.toByteArray(StandardCharsets.UTF_8)) {
        events += "close$attempt"
      }
    }

    fun inspectLikeLstat(): RestoreAtomicFileSnapshot {
      events += "inspect$attempt"
      return snapshot(base = true, backup = backup != null)
    }

    assertThrows(java.io.IOException::class.java) {
      RestoreAtomicFilePostconditions.openVerified(
        openRead = ::openLikeAtomicFile,
        inspectAfterOpen = ::inspectLikeLstat,
      )
    }
    assertEquals("NEW", base)
    assertEquals("OLD", backup)
    assertEquals(listOf("open1", "inspect1", "close1"), events)

    parentWritable = true
    val recovered = RestoreAtomicFilePostconditions.openVerified(
      openRead = ::openLikeAtomicFile,
      inspectAfterOpen = ::inspectLikeLstat,
    )
    recovered.use { stream ->
      assertEquals("OLD", stream.readBytes().toString(StandardCharsets.UTF_8))
    }
    assertEquals(null, backup)
    assertEquals(
      listOf("open1", "inspect1", "close1", "open2", "recover2", "inspect2", "close2"),
      events,
    )
  }

  @Test
  fun failedNewCleanupClosesTheOpenedStream() {
    val stream = TrackingInputStream("OLD".toByteArray(StandardCharsets.UTF_8)) {}

    assertThrows(java.io.IOException::class.java) {
      RestoreAtomicFilePostconditions.openVerified(
        openRead = { stream },
        inspectAfterOpen = { snapshot(base = true, new = true) },
      )
    }

    assertTrue(stream.closed)
  }

  @Test
  fun loneNewRemainsAnUnpublishedFirstWrite() {
    assertEquals(
      RestoreAtomicReadState.UNPUBLISHED_NEW_ONLY,
      RestoreAtomicFilePostconditions.classifyBeforeOpen(snapshot(new = true)),
    )
    assertEquals(
      RestoreAtomicReadState.ABSENT,
      RestoreAtomicFilePostconditions.classifyBeforeOpen(snapshot()),
    )
    assertEquals(
      RestoreAtomicReadState.COMMITTED_CANDIDATE,
      RestoreAtomicFilePostconditions.classifyBeforeOpen(snapshot(base = true)),
    )
    assertEquals(
      RestoreAtomicReadState.COMMITTED_CANDIDATE,
      RestoreAtomicFilePostconditions.classifyBeforeOpen(snapshot(backup = true)),
    )
  }

  private fun snapshot(
    base: Boolean = false,
    new: Boolean = false,
    backup: Boolean = false,
  ) = RestoreAtomicFileSnapshot(
    basePresent = base,
    newPresent = new,
    legacyBackupPresent = backup,
  )

  private class TrackingInputStream(
    bytes: ByteArray,
    private val onClose: () -> Unit,
  ) : ByteArrayInputStream(bytes) {
    var closed = false
      private set

    override fun close() {
      assertFalse("stream was closed more than once", closed)
      closed = true
      onClose()
      super.close()
    }
  }
}
