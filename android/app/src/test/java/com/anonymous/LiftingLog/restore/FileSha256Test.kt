package com.anonymous.LiftingLog.restore

import java.io.IOException
import java.util.Collections
import java.util.concurrent.ArrayBlockingQueue
import java.util.concurrent.CountDownLatch
import java.util.concurrent.ThreadPoolExecutor
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class FileSha256Test {
  private class FakeSource(
    private val bytes: ByteArray = byteArrayOf(),
    private val virtualSize: Long = bytes.size.toLong(),
    private val pathSizeOverride: Long = virtualSize,
    private val descriptorSizeOverride: Long = pathSizeOverride,
    private val failReadAt: Long? = null,
    private val closeFailure: IOException? = null,
    private val verifyAction: (() -> Unit)? = null
  ) : FileSha256Source {
    var openCount = 0
    var closeCount = 0
    var largestRead = 0
    var totalRead = 0L

    override fun open(uri: String): OpenFileSha256Source {
      openCount += 1
      return object : OpenFileSha256Source {
        override val pathSize = pathSizeOverride
        override val descriptorSize = descriptorSizeOverride

        override fun read(buffer: ByteArray, offset: Int, length: Int): Int {
          if (failReadAt != null && totalRead >= failReadAt) {
            throw IOException("read failed")
          }
          largestRead = maxOf(largestRead, length)
          if (totalRead >= virtualSize) {
            return -1
          }
          val count = minOf(length.toLong(), virtualSize - totalRead).toInt()
          for (index in 0 until count) {
            buffer[offset + index] = if (bytes.isEmpty()) {
              0
            } else {
              bytes[((totalRead + index) % bytes.size).toInt()]
            }
          }
          totalRead += count
          return count
        }

        override fun verifyUnchanged(expectedBytes: Long) {
          verifyAction?.invoke()
        }

        override fun close() {
          closeCount += 1
          closeFailure?.let { throw it }
        }
      }
    }
  }

  @Test
  fun hashesKnownEmptyAbcAndMultiChunkVectorsThroughTheProductionLoop() {
    val empty = FakeSource()
    assertEquals(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      FileSha256.hash(empty, "file:///empty", 0).sha256
    )

    val abc = FakeSource("abc".toByteArray())
    assertEquals(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
      FileSha256.hash(abc, "file:///abc", 3).sha256
    )

    val pattern = ByteArray(FileSha256.BUFFER_BYTES * 2 + 37) { index ->
      ((index * 31 + 7) and 0xff).toByte()
    }
    val multi = FakeSource(pattern)
    val result = FileSha256.hash(multi, "file:///multi", pattern.size.toLong())
    assertEquals("da50f03fe084b809d769b6964c569f1a450e46ef46784b53c2aa00518479cd37", result.sha256)
    assertEquals(pattern.size.toLong(), result.bytes)
    assertTrue(multi.largestRead <= FileSha256.BUFFER_BYTES)
  }

  @Test
  fun hashesTheMaximumSizeWithBoundedReads() {
    val source = FakeSource(virtualSize = FileSha256.DEFAULT_MAX_BYTES)
    val result = FileSha256.hash(
      source,
      "file:///maximum",
      FileSha256.DEFAULT_MAX_BYTES
    )

    assertEquals(
      "a6d72ac7690f53be6ae46ba88506bd97302a093f7108472bd9efc3cefda06484",
      result.sha256
    )
    assertEquals(FileSha256.DEFAULT_MAX_BYTES, result.bytes)
    assertEquals(FileSha256.BUFFER_BYTES, source.largestRead)
  }

  @Test
  fun rejectsInvalidInputsSizeChangesAndReadFailures() {
    assertEquals(
      "invalid_uri",
      assertThrows(FileSha256Exception::class.java) {
        FileSha256.hash(FakeSource(), "content://provider/file", 1)
      }.code
    )
    assertEquals(
      "invalid_max_bytes",
      assertThrows(FileSha256Exception::class.java) {
        FileSha256.validateMaxBytes(1.5)
      }.code
    )
    assertEquals(
      "file_too_large",
      assertThrows(FileSha256Exception::class.java) {
        FileSha256.hash(FakeSource(byteArrayOf(1, 2)), "file:///large", 1)
      }.code
    )
    assertEquals(
      "file_changed",
      assertThrows(FileSha256Exception::class.java) {
        FileSha256.hash(
          FakeSource(byteArrayOf(1), pathSizeOverride = 1, descriptorSizeOverride = 2),
          "file:///changed",
          2
        )
      }.code
    )
    assertEquals(
      "premature_eof",
      assertThrows(FileSha256Exception::class.java) {
        FileSha256.hash(
          FakeSource(byteArrayOf(1), virtualSize = 1, pathSizeOverride = 2,
            descriptorSizeOverride = 2),
          "file:///truncated",
          2
        )
      }.code
    )
    assertEquals(
      "read_failed",
      assertThrows(FileSha256Exception::class.java) {
        FileSha256.hash(
          FakeSource(byteArrayOf(1), failReadAt = 0),
          "file:///read-error",
          1
        )
      }.code
    )
  }

  @Test
  fun detectsGrowthAndFinalVerificationFailure() {
    val grown = FakeSource(
      bytes = byteArrayOf(1, 2),
      virtualSize = 2,
      pathSizeOverride = 1,
      descriptorSizeOverride = 1
    )
    assertEquals(
      "file_changed",
      assertThrows(FileSha256Exception::class.java) {
        FileSha256.hash(grown, "file:///grown", 2)
      }.code
    )

    val verificationFailure = FakeSource(
      bytes = byteArrayOf(1),
      verifyAction = { throw IOException("path replaced") }
    )
    assertEquals(
      "file_changed",
      assertThrows(FileSha256Exception::class.java) {
        FileSha256.hash(verificationFailure, "file:///replaced", 1)
      }.code
    )
  }

  @Test
  fun cancellationIsCheckedBeforeMidReadAndImmediatelyBeforeSuccess() {
    val preCancelled = FakeSource(byteArrayOf(1))
    assertEquals(
      "aborted",
      assertThrows(FileSha256Exception::class.java) {
        FileSha256.hash(preCancelled, "file:///pre", 1) { true }
      }.code
    )
    assertEquals(0, preCancelled.openCount)

    val midReadBytes = FileSha256.BUFFER_BYTES * 2L
    val midRead = FakeSource(virtualSize = midReadBytes)
    assertEquals(
      "aborted",
      assertThrows(FileSha256Exception::class.java) {
        FileSha256.hash(midRead, "file:///mid", midReadBytes) {
          midRead.totalRead >= FileSha256.BUFFER_BYTES
        }
      }.code
    )
    assertEquals(1, midRead.closeCount)

    val finalCancelled = AtomicBoolean(false)
    val finalSource = FakeSource(
      bytes = byteArrayOf(1),
      verifyAction = { finalCancelled.set(true) }
    )
    assertEquals(
      "aborted",
      assertThrows(FileSha256Exception::class.java) {
        FileSha256.hash(finalSource, "file:///final", 1) { finalCancelled.get() }
      }.code
    )
    assertEquals(1, finalSource.closeCount)
  }

  @Test
  fun preservesPrimaryFailureAndReportsStandaloneCloseFailure() {
    val primarySource = FakeSource(
      bytes = byteArrayOf(1),
      failReadAt = 0,
      closeFailure = IOException("close failed")
    )
    val primary = assertThrows(FileSha256Exception::class.java) {
      FileSha256.hash(primarySource, "file:///primary", 1)
    }
    assertEquals("read_failed", primary.code)
    assertEquals("close failed", primary.suppressed.single().message)

    val closeOnly = assertThrows(FileSha256Exception::class.java) {
      FileSha256.hash(
        FakeSource(closeFailure = IOException("close failed")),
        "file:///close",
        0
      )
    }
    assertEquals("close_failed", closeOnly.code)
  }

  @Test
  fun asyncJobsBoundAdmissionCancelInIsolationAndReleaseRecords() {
    val executor = oneWorkerExecutor()
    val firstStarted = CountDownLatch(1)
    val releaseFirst = CountDownLatch(1)
    val secondHashed = AtomicBoolean(false)
    val errors = Collections.synchronizedList(mutableListOf<String>())
    val completions = CountDownLatch(2)
    val jobs = FileSha256AsyncJobs(executor) { uri, _, cancelled ->
      if (uri.endsWith("first")) {
        firstStarted.countDown()
        releaseFirst.await(5, TimeUnit.SECONDS)
      } else {
        secondHashed.set(true)
      }
      if (cancelled()) throw FileSha256CancelledException()
      FileSha256Result("0".repeat(64), 0)
    }

    jobs.submit("file:///first", 0.0, "first", { completions.countDown() }) {
      errors.add(it.code)
      completions.countDown()
    }
    assertTrue(firstStarted.await(2, TimeUnit.SECONDS))
    jobs.submit("file:///second", 0.0, "second", { completions.countDown() }) {
      errors.add(it.code)
      completions.countDown()
    }
    assertTrue(jobs.cancel("second"))
    val rejected = mutableListOf<String>()
    jobs.submit("file:///third", 0.0, "third", {}, { rejected.add(it.code) })
    assertEquals(listOf("admission_limit"), rejected)

    releaseFirst.countDown()
    assertTrue(completions.await(2, TimeUnit.SECONDS))
    assertFalse(secondHashed.get())
    assertEquals(listOf("aborted"), errors)
    waitForNoJobs(jobs)
    assertEquals(0, jobs.activeJobCount())
    jobs.invalidate()
  }

  @Test
  fun invalidationCancelsOwnedRunningAndQueuedWork() {
    val executor = oneWorkerExecutor()
    val started = CountDownLatch(1)
    val release = CountDownLatch(1)
    val errors = Collections.synchronizedList(mutableListOf<String>())
    val completions = CountDownLatch(2)
    val hashCalls = AtomicInteger(0)
    val jobs = FileSha256AsyncJobs(executor) { _, _, cancelled ->
      hashCalls.incrementAndGet()
      started.countDown()
      release.await(5, TimeUnit.SECONDS)
      if (cancelled()) throw FileSha256CancelledException()
      FileSha256Result("0".repeat(64), 0)
    }
    val onError: (FileSha256Exception) -> Unit = {
      errors.add(it.code)
      completions.countDown()
    }

    jobs.submit("file:///running", 0.0, "running", { completions.countDown() }, onError)
    assertTrue(started.await(2, TimeUnit.SECONDS))
    jobs.submit("file:///queued", 0.0, "queued", { completions.countDown() }, onError)
    jobs.invalidate()
    release.countDown()

    assertTrue(completions.await(2, TimeUnit.SECONDS))
    assertEquals(listOf("aborted", "aborted"), errors.sorted())
    assertEquals(1, hashCalls.get())
    waitForNoJobs(jobs)
    assertTrue(executor.awaitTermination(2, TimeUnit.SECONDS))
  }

  private fun oneWorkerExecutor() = ThreadPoolExecutor(
    1,
    1,
    0L,
    TimeUnit.MILLISECONDS,
    ArrayBlockingQueue(1),
    { runnable -> Thread(runnable).apply { isDaemon = true } },
    ThreadPoolExecutor.AbortPolicy()
  )

  private fun waitForNoJobs(jobs: FileSha256AsyncJobs) {
    repeat(100) {
      if (jobs.activeJobCount() == 0) return
      Thread.sleep(10)
    }
  }
}
