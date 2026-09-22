package __ANDROID_PACKAGE__.restore

import android.content.Context
import android.system.ErrnoException
import android.system.Os
import android.system.OsConstants
import android.util.AtomicFile
import java.io.ByteArrayOutputStream
import java.io.Closeable
import java.io.File
import java.io.FileNotFoundException
import java.io.FileOutputStream
import java.io.IOException
import java.nio.ByteBuffer
import java.nio.charset.CodingErrorAction
import java.nio.charset.StandardCharsets

sealed class RestoreControlReadResult {
  data object Absent : RestoreControlReadResult()
  data class Present(val json: String) : RestoreControlReadResult()
  data class Unreadable(val code: String) : RestoreControlReadResult()
}

internal data class RestoreAtomicFileSnapshot(
  val basePresent: Boolean,
  val newPresent: Boolean,
  val legacyBackupPresent: Boolean,
)

internal enum class RestoreAtomicReadState {
  ABSENT,
  UNPUBLISHED_NEW_ONLY,
  COMMITTED_CANDIDATE,
}

internal object RestoreAtomicFilePostconditions {
  fun classifyBeforeOpen(snapshot: RestoreAtomicFileSnapshot): RestoreAtomicReadState {
    if (snapshot.basePresent || snapshot.legacyBackupPresent) {
      return RestoreAtomicReadState.COMMITTED_CANDIDATE
    }
    return if (snapshot.newPresent) {
      RestoreAtomicReadState.UNPUBLISHED_NEW_ONLY
    } else {
      RestoreAtomicReadState.ABSENT
    }
  }

  fun <T : Closeable> openVerified(
    openRead: () -> T,
    inspectAfterOpen: () -> RestoreAtomicFileSnapshot,
  ): T {
    val stream = openRead()
    try {
      requireRecoveredReadState(inspectAfterOpen())
      return stream
    } catch (error: Throwable) {
      try {
        stream.close()
      } catch (closeError: Throwable) {
        error.addSuppressed(closeError)
      }
      throw error
    }
  }

  private fun requireRecoveredReadState(snapshot: RestoreAtomicFileSnapshot) {
    if (!snapshot.basePresent) {
      throw IOException("Atomic restore control read did not leave a base file")
    }
    if (snapshot.legacyBackupPresent) {
      throw IOException("Atomic restore control read did not recover the legacy backup")
    }
    if (snapshot.newPresent) {
      throw IOException("Atomic restore control read did not remove unpublished staging state")
    }
  }
}

object RestoreControlStore {
  const val MAX_RECORD_BYTES = 256 * 1024

  private const val DIRECTORY_NAME = "restore-control"
  private const val PENDING_FILENAME = "pending.json"
  private const val OUTCOME_FILENAME = "outcome.json"
  private const val READ_BUFFER_BYTES = 8 * 1024

  @Synchronized
  fun read(context: Context, name: String): RestoreControlReadResult {
    val baseFile = baseFile(context, name)
    val atomicFile = AtomicFile(baseFile)

    return try {
      when (inspectReadState(baseFile)) {
        ReadState.ABSENT -> return RestoreControlReadResult.Absent
        ReadState.UNPUBLISHED_NEW_ONLY -> {
          // AtomicFile.startWrite() publishes only through finishWrite(). A lone regular
          // .new file is an interrupted, unpublished first write and is safely ignored.
          return RestoreControlReadResult.Absent
        }
        ReadState.COMMITTED_CANDIDATE -> Unit
      }
      val bytes = readBounded(atomicFile, baseFile)
      val json = decodeUtf8(bytes)
      RestoreJsonEnvelope.requireObject(json)
      RestoreControlReadResult.Present(json)
    } catch (_: FileNotFoundException) {
      // Presence was established with lstat before openRead, so disappearance or an
      // inaccessible path here is ambiguous rather than proof of absence.
      RestoreControlReadResult.Unreadable("io_error")
    } catch (_: RecordTooLargeException) {
      RestoreControlReadResult.Unreadable("record_too_large")
    } catch (_: InvalidUtf8Exception) {
      RestoreControlReadResult.Unreadable("invalid_utf8")
    } catch (_: InvalidRestoreJsonObjectException) {
      RestoreControlReadResult.Unreadable("invalid_json")
    } catch (_: IOException) {
      RestoreControlReadResult.Unreadable("io_error")
    } catch (_: SecurityException) {
      RestoreControlReadResult.Unreadable("access_denied")
    }
  }

  @Synchronized
  fun write(context: Context, name: String, json: String) {
    RestoreJsonEnvelope.requireObject(json)
    if (hasUnpairedSurrogate(json)) {
      throw IllegalArgumentException("Restore control JSON contains an unpaired surrogate")
    }

    val bytes = json.toByteArray(StandardCharsets.UTF_8)
    if (bytes.size > MAX_RECORD_BYTES) {
      throw IllegalArgumentException("Restore control record exceeds $MAX_RECORD_BYTES UTF-8 bytes")
    }

    val baseFile = baseFile(context, name)
    ensureDirectory(baseFile.parentFile)
    requireRegularAssociatedFiles(baseFile)
    val atomicFile = AtomicFile(baseFile)
    var stream: FileOutputStream? = null
    var finishReturned = false

    try {
      stream = atomicFile.startWrite()
      stream.write(bytes)
      stream.flush()
      stream.fd.sync()
      atomicFile.finishWrite(stream)
      finishReturned = true
      stream = null
    } catch (error: Exception) {
      if (!finishReturned) {
        stream?.let {
          try {
            atomicFile.failWrite(it)
          } catch (_: Exception) {
            // The caller treats this write as uncertain and must reread/fail closed.
          }
        }
      }
      throw IOException("Atomic restore control write failed", error)
    }

    val published = try {
      readBounded(atomicFile, baseFile)
    } catch (error: Exception) {
      throw IOException("Published restore control record could not be verified", error)
    }
    if (!published.contentEquals(bytes)) {
      throw IOException("Published restore control record differs from requested bytes")
    }
  }

  @Synchronized
  fun delete(context: Context, name: String) {
    val baseFile = baseFile(context, name)
    if (!requireControlDirectory(baseFile)) {
      return
    }
    requireRegularAssociatedFiles(baseFile)
    val atomicFile = AtomicFile(baseFile)
    try {
      atomicFile.delete()
    } catch (error: Exception) {
      throw IOException("Atomic restore control delete failed", error)
    }

    val remnants = associatedFiles(baseFile).filter { lstatModeOrNull(it) != null }
    if (remnants.isNotEmpty()) {
      throw IOException(
        "Restore control delete left associated state: ${remnants.joinToString { it.name }}"
      )
    }
  }

  private fun baseFile(context: Context, name: String): File {
    val filename = when (name) {
      "pending" -> PENDING_FILENAME
      "outcome" -> OUTCOME_FILENAME
      else -> throw IllegalArgumentException("Unknown restore control record name")
    }
    return File(File(context.filesDir, DIRECTORY_NAME), filename)
  }

  private fun associatedFiles(baseFile: File): List<File> = listOf(
    baseFile,
    File("${baseFile.path}.new"),
    legacyBackupFile(baseFile)
  )

  private fun legacyBackupFile(baseFile: File): File = File("${baseFile.path}.bak")

  private fun inspectReadState(baseFile: File): ReadState {
    if (!requireControlDirectory(baseFile)) {
      return ReadState.ABSENT
    }

    return when (RestoreAtomicFilePostconditions.classifyBeforeOpen(inspectAssociatedFiles(baseFile))) {
      RestoreAtomicReadState.ABSENT -> ReadState.ABSENT
      RestoreAtomicReadState.UNPUBLISHED_NEW_ONLY -> ReadState.UNPUBLISHED_NEW_ONLY
      RestoreAtomicReadState.COMMITTED_CANDIDATE -> ReadState.COMMITTED_CANDIDATE
    }
  }

  private fun inspectAssociatedFiles(baseFile: File): RestoreAtomicFileSnapshot {
    val baseMode = lstatModeOrNull(baseFile)
    val newMode = lstatModeOrNull(File("${baseFile.path}.new"))
    val backupMode = lstatModeOrNull(legacyBackupFile(baseFile))
    for (mode in listOfNotNull(baseMode, newMode, backupMode)) {
      if (!OsConstants.S_ISREG(mode)) {
        throw IOException("Restore control associated path is not a regular file")
      }
    }
    return RestoreAtomicFileSnapshot(
      basePresent = baseMode != null,
      newPresent = newMode != null,
      legacyBackupPresent = backupMode != null,
    )
  }

  private fun requireControlDirectory(baseFile: File): Boolean {
    val directory = baseFile.parentFile
      ?: throw IOException("Restore control directory has no parent")
    val filesDirectory = directory.parentFile
      ?: throw IOException("Application files directory has no parent")
    val filesDirectoryMode = lstatModeOrNull(filesDirectory)
      ?: throw IOException("Application files directory is absent")
    if (!OsConstants.S_ISDIR(filesDirectoryMode)) {
      throw IOException("Application files path is not a directory")
    }

    val directoryMode = lstatModeOrNull(directory) ?: return false
    if (!OsConstants.S_ISDIR(directoryMode)) {
      throw IOException("Restore control directory path is not a directory")
    }
    return true
  }

  private fun requireRegularAssociatedFiles(baseFile: File) {
    for (file in associatedFiles(baseFile)) {
      val mode = lstatModeOrNull(file) ?: continue
      if (!OsConstants.S_ISREG(mode)) {
        throw IOException("Restore control associated path is not a regular file: ${file.name}")
      }
    }
  }

  private fun lstatModeOrNull(file: File): Int? {
    return try {
      Os.lstat(file.path).st_mode
    } catch (error: ErrnoException) {
      if (error.errno == OsConstants.ENOENT) {
        return null
      }
      throw IOException("Could not inspect restore control path", error)
    }
  }

  private fun ensureDirectory(directory: File?) {
    if (directory == null) {
      throw IOException("Restore control directory has no parent")
    }
    val filesDirectory = directory.parentFile
      ?: throw IOException("Application files directory has no parent")
    val filesDirectoryMode = lstatModeOrNull(filesDirectory)
      ?: throw IOException("Application files directory is absent")
    if (!OsConstants.S_ISDIR(filesDirectoryMode)) {
      throw IOException("Application files path is not a directory")
    }

    val existingMode = lstatModeOrNull(directory)
    if (existingMode != null) {
      if (!OsConstants.S_ISDIR(existingMode)) {
        throw IOException("Restore control directory path is not a directory")
      }
      return
    }
    if (!directory.mkdir()) {
      throw IOException("Could not create restore control directory")
    }
    val createdMode = lstatModeOrNull(directory)
    if (createdMode == null || !OsConstants.S_ISDIR(createdMode)) {
      throw IOException("Created restore control path is not a directory")
    }
  }

  private fun readBounded(atomicFile: AtomicFile, baseFile: File): ByteArray {
    RestoreAtomicFilePostconditions.openVerified(
      openRead = { atomicFile.openRead() },
      inspectAfterOpen = {
        if (!requireControlDirectory(baseFile)) {
          throw IOException("Restore control directory disappeared during atomic read")
        }
        inspectAssociatedFiles(baseFile)
      },
    ).use { input ->
      val output = ByteArrayOutputStream()
      val buffer = ByteArray(READ_BUFFER_BYTES)
      var total = 0
      while (true) {
        val maximumRead = minOf(buffer.size, MAX_RECORD_BYTES + 1 - total)
        if (maximumRead <= 0) {
          throw RecordTooLargeException()
        }
        val count = input.read(buffer, 0, maximumRead)
        if (count < 0) {
          return output.toByteArray()
        }
        output.write(buffer, 0, count)
        total += count
        if (total > MAX_RECORD_BYTES) {
          throw RecordTooLargeException()
        }
      }
    }
  }

  private fun decodeUtf8(bytes: ByteArray): String {
    return try {
      StandardCharsets.UTF_8
        .newDecoder()
        .onMalformedInput(CodingErrorAction.REPORT)
        .onUnmappableCharacter(CodingErrorAction.REPORT)
        .decode(ByteBuffer.wrap(bytes))
        .toString()
    } catch (error: Exception) {
      throw InvalidUtf8Exception(error)
    }
  }

  private fun hasUnpairedSurrogate(value: String): Boolean {
    var index = 0
    while (index < value.length) {
      val current = value[index]
      if (Character.isHighSurrogate(current)) {
        if (index + 1 >= value.length || !Character.isLowSurrogate(value[index + 1])) {
          return true
        }
        index += 2
      } else {
        if (Character.isLowSurrogate(current)) {
          return true
        }
        index += 1
      }
    }
    return false
  }

  private class RecordTooLargeException : IOException()
  private class InvalidUtf8Exception(cause: Throwable) : IOException(cause)

  private enum class ReadState {
    ABSENT,
    UNPUBLISHED_NEW_ONLY,
    COMMITTED_CANDIDATE,
  }

}
