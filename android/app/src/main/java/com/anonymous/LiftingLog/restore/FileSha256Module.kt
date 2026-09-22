package com.anonymous.LiftingLog.restore

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import java.util.concurrent.ArrayBlockingQueue
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.RejectedExecutionException
import java.util.concurrent.ThreadPoolExecutor
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger

internal class FileSha256AsyncJobs(
  private val executor: ThreadPoolExecutor = createExecutor(),
  private val hash: (String, Long, () -> Boolean) -> FileSha256Result
) {
  private data class Job(
    val cancelled: AtomicBoolean = AtomicBoolean(false),
    val settled: AtomicBoolean = AtomicBoolean(false)
  )

  private val jobs = ConcurrentHashMap<String, Job>()
  private val invalidated = AtomicBoolean(false)

  fun submit(
    uri: String,
    maxBytes: Double,
    requestId: String,
    onSuccess: (FileSha256Result) -> Unit,
    onError: (FileSha256Exception) -> Unit
  ) {
    val validatedMaxBytes = try {
      validateRequestId(requestId)
      FileSha256.requireLocalFileUri(uri)
      FileSha256.validateMaxBytes(maxBytes)
    } catch (error: FileSha256Exception) {
      onError(error)
      return
    }
    if (invalidated.get()) {
      onError(unavailableError())
      return
    }

    val job = Job()
    if (jobs.putIfAbsent(requestId, job) != null) {
      onError(FileSha256Exception("duplicate_request", "SHA-256 request ID is already active."))
      return
    }
    if (invalidated.get()) {
      job.cancelled.set(true)
    }

    try {
      executor.execute {
        try {
          if (job.cancelled.get()) {
            throw FileSha256CancelledException()
          }
          val result = hash(uri, validatedMaxBytes) { job.cancelled.get() }
          if (job.cancelled.get()) {
            throw FileSha256CancelledException()
          }
          settle(job) { onSuccess(result) }
        } catch (error: FileSha256Exception) {
          settle(job) { onError(error) }
        } catch (error: Exception) {
          settle(job) {
            onError(FileSha256Exception("hash_failed", "Native SHA-256 hashing failed.", error))
          }
        } finally {
          jobs.remove(requestId, job)
        }
      }
    } catch (error: RejectedExecutionException) {
      jobs.remove(requestId, job)
      val rejection = if (invalidated.get()) unavailableError() else FileSha256Exception(
        "admission_limit",
        "Too many native SHA-256 requests are active."
      )
      settle(job) { onError(rejection) }
    }
  }

  fun cancel(requestId: String): Boolean {
    if (!isValidRequestId(requestId)) {
      return false
    }
    jobs[requestId]?.cancelled?.set(true)
    return true
  }

  fun invalidate() {
    if (invalidated.compareAndSet(false, true)) {
      jobs.values.forEach { job -> job.cancelled.set(true) }
      executor.shutdown()
    }
  }

  internal fun activeJobCount(): Int = jobs.size

  private fun settle(job: Job, settlement: () -> Unit) {
    if (job.settled.compareAndSet(false, true)) {
      settlement()
    }
  }

  private fun validateRequestId(requestId: String) {
    if (!isValidRequestId(requestId)) {
      throw FileSha256Exception("invalid_request", "SHA-256 request ID is invalid.")
    }
  }

  private fun isValidRequestId(requestId: String): Boolean =
    requestId.isNotEmpty() && requestId.length <= 128 &&
      requestId.all { character -> character.isLetterOrDigit() || character in "._-" }

  private fun unavailableError() = FileSha256Exception(
    "unavailable",
    "The native SHA-256 module is invalidated."
  )

  companion object {
    const val MAX_RUNNING_JOBS = 2
    const val MAX_QUEUED_JOBS = 2
    private val nextThreadNumber = AtomicInteger(0)

    fun createExecutor(): ThreadPoolExecutor = ThreadPoolExecutor(
      MAX_RUNNING_JOBS,
      MAX_RUNNING_JOBS,
      0L,
      TimeUnit.MILLISECONDS,
      ArrayBlockingQueue(MAX_QUEUED_JOBS),
      { runnable ->
        Thread(runnable, "file-sha256-${nextThreadNumber.incrementAndGet()}").apply {
          isDaemon = true
        }
      },
      ThreadPoolExecutor.AbortPolicy()
    )
  }
}

class FileSha256Module(
  reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {
  private val source = AndroidFileSha256Source()
  private val jobs = FileSha256AsyncJobs { uri, maxBytes, isCancelled ->
    FileSha256.hash(source, uri, maxBytes, isCancelled)
  }

  override fun getName(): String = NAME

  @ReactMethod(isBlockingSynchronousMethod = true)
  fun sha256FileSync(uri: String, maxBytes: Double): WritableMap = try {
    successMap(FileSha256.hash(source, uri, FileSha256.validateMaxBytes(maxBytes)))
  } catch (error: FileSha256Exception) {
    errorMap(error)
  } catch (error: Exception) {
    errorMap(FileSha256Exception("hash_failed", "Native SHA-256 hashing failed.", error))
  }

  @ReactMethod
  fun sha256FileAsync(uri: String, maxBytes: Double, requestId: String, promise: Promise) {
    jobs.submit(
      uri,
      maxBytes,
      requestId,
      { result -> promise.resolve(successMap(result)) },
      { error -> promise.reject(error.code, error.message, error) }
    )
  }

  @ReactMethod
  fun cancelSha256File(requestId: String, promise: Promise) {
    promise.resolve(jobs.cancel(requestId))
  }

  override fun invalidate() {
    jobs.invalidate()
    super.invalidate()
  }

  private fun successMap(result: FileSha256Result): WritableMap = Arguments.createMap().apply {
    putString("status", "success")
    putString("sha256", result.sha256)
    putDouble("bytes", result.bytes.toDouble())
  }

  private fun errorMap(error: FileSha256Exception): WritableMap = Arguments.createMap().apply {
    putString("status", "error")
    putString("code", error.code)
    putString("message", error.message ?: "Native SHA-256 hashing failed.")
  }

  companion object {
    const val NAME = "FileSha256"
  }
}
