package com.anonymous.LiftingLog.restore

import android.system.ErrnoException
import android.system.Os
import android.system.OsConstants
import java.io.Closeable
import java.io.File
import java.io.FileInputStream
import java.io.FileNotFoundException
import java.io.IOException
import java.net.URI
import java.net.URISyntaxException
import java.security.MessageDigest

internal data class FileSha256Result(
  val sha256: String,
  val bytes: Long
)

internal open class FileSha256Exception(
  val code: String,
  message: String,
  cause: Throwable? = null
) : IOException(message, cause)

internal class FileSha256CancelledException : FileSha256Exception(
  "aborted",
  "SHA-256 hashing was aborted."
)

internal interface FileSha256Source {
  fun open(uri: String): OpenFileSha256Source
}

internal interface OpenFileSha256Source : Closeable {
  val pathSize: Long
  val descriptorSize: Long
  fun read(buffer: ByteArray, offset: Int, length: Int): Int
  fun verifyUnchanged(expectedBytes: Long)
}

internal object FileSha256 {
  const val BUFFER_BYTES = 64 * 1024
  const val DEFAULT_MAX_BYTES = 256L * 1024L * 1024L
  const val MAX_SAFE_INTEGER = 9_007_199_254_740_991L

  fun validateMaxBytes(maxBytes: Double): Long {
    if (!maxBytes.isFinite() || maxBytes < 0.0 || maxBytes > MAX_SAFE_INTEGER.toDouble() ||
      maxBytes != Math.floor(maxBytes)
    ) {
      throw FileSha256Exception(
        "invalid_max_bytes",
        "maxBytes must be a non-negative safe integer."
      )
    }
    return maxBytes.toLong()
  }

  fun requireLocalFileUri(uri: String): URI {
    if (uri.isBlank() || !uri.startsWith("file:///")) {
      throw FileSha256Exception("invalid_uri", "Only local file:// URIs can be hashed.")
    }
    val parsed = try {
      URI(uri)
    } catch (error: URISyntaxException) {
      throw FileSha256Exception("invalid_uri", "The local file URI is invalid.", error)
    }
    if (
      parsed.scheme != "file" ||
      parsed.rawAuthority != null ||
      parsed.rawQuery != null ||
      parsed.rawFragment != null ||
      parsed.path.isNullOrEmpty() ||
      !parsed.path.startsWith("/")
    ) {
      throw FileSha256Exception("invalid_uri", "Only local file:// URIs can be hashed.")
    }
    return parsed
  }

  fun hash(
    source: FileSha256Source,
    uri: String,
    maxBytes: Long,
    isCancelled: () -> Boolean = { false }
  ): FileSha256Result {
    requireLocalFileUri(uri)
    if (maxBytes < 0L || maxBytes > MAX_SAFE_INTEGER) {
      throw FileSha256Exception(
        "invalid_max_bytes",
        "maxBytes must be a non-negative safe integer."
      )
    }
    checkCancelled(isCancelled)

    val opened = source.open(uri)
    var primaryFailure: Throwable? = null
    try {
      val expectedBytes = opened.pathSize
      if (expectedBytes < 0L || opened.descriptorSize < 0L) {
        throw FileSha256Exception("invalid_size", "File size is unavailable or invalid.")
      }
      if (expectedBytes != opened.descriptorSize) {
        throw FileSha256Exception(
          "file_changed",
          "File size changed before hashing completed."
        )
      }
      if (expectedBytes > maxBytes) {
        throw FileSha256Exception(
          "file_too_large",
          "File size $expectedBytes exceeds the $maxBytes-byte SHA-256 limit."
        )
      }

      val digest = MessageDigest.getInstance("SHA-256")
      val buffer = ByteArray(BUFFER_BYTES)
      var totalBytes = 0L
      while (totalBytes < expectedBytes) {
        checkCancelled(isCancelled)
        val requested = minOf(BUFFER_BYTES.toLong(), expectedBytes - totalBytes).toInt()
        val read = read(opened, buffer, requested)
        if (read < 0) {
          throw FileSha256Exception("premature_eof", "Unexpected end of file while hashing.")
        }
        if (read == 0 || read > requested) {
          throw FileSha256Exception("invalid_read", "File read returned an invalid byte count.")
        }
        totalBytes += read.toLong()
        if (totalBytes > maxBytes) {
          throw FileSha256Exception(
            "file_too_large",
            "File exceeds the $maxBytes-byte SHA-256 limit."
          )
        }
        digest.update(buffer, 0, read)
        checkCancelled(isCancelled)
      }

      val trailing = read(opened, buffer, 1)
      if (trailing > 0) {
        if (totalBytes + trailing > maxBytes) {
          throw FileSha256Exception(
            "file_too_large",
            "File exceeds the $maxBytes-byte SHA-256 limit."
          )
        }
        throw FileSha256Exception(
          "file_changed",
          "File is longer than its reported size."
        )
      }
      if (trailing == 0) {
        throw FileSha256Exception("invalid_read", "File read returned an invalid byte count.")
      }

      try {
        opened.verifyUnchanged(expectedBytes)
      } catch (error: FileSha256Exception) {
        throw error
      } catch (error: IOException) {
        throw FileSha256Exception(
          "file_changed",
          "File identity or size could not be verified after hashing.",
          error
        )
      }
      checkCancelled(isCancelled)
      return FileSha256Result(
        digest.digest().joinToString("") { byte -> "%02x".format(byte.toInt() and 0xff) },
        totalBytes
      )
    } catch (error: Throwable) {
      primaryFailure = error
      throw error
    } finally {
      try {
        opened.close()
      } catch (closeError: Throwable) {
        if (primaryFailure != null) {
          primaryFailure.addSuppressed(closeError)
        } else {
          throw FileSha256Exception(
            "close_failed",
            "Failed to close the SHA-256 source.",
            closeError
          )
        }
      }
    }
  }

  private fun read(opened: OpenFileSha256Source, buffer: ByteArray, length: Int): Int = try {
    opened.read(buffer, 0, length)
  } catch (error: FileSha256Exception) {
    throw error
  } catch (error: IOException) {
    throw FileSha256Exception("read_failed", "Failed to read the SHA-256 source.", error)
  }

  private fun checkCancelled(isCancelled: () -> Boolean) {
    if (isCancelled()) {
      throw FileSha256CancelledException()
    }
  }
}

internal class AndroidFileSha256Source : FileSha256Source {
  override fun open(uri: String): OpenFileSha256Source {
    val parsed = FileSha256.requireLocalFileUri(uri)
    val file = try {
      File(parsed)
    } catch (error: IllegalArgumentException) {
      throw FileSha256Exception("invalid_uri", "The local file URI is invalid.", error)
    }
    val initialStat = statPath(file)
    if (!OsConstants.S_ISREG(initialStat.st_mode)) {
      throw FileSha256Exception(
        "not_file",
        "The SHA-256 source must be a regular file, not a directory or special file."
      )
    }

    val stream = try {
      FileInputStream(file)
    } catch (error: FileNotFoundException) {
      throw FileSha256Exception(
        "unreadable",
        "File does not exist or cannot be read.",
        error
      )
    }
    try {
      val openedStat = try {
        Os.fstat(stream.fd)
      } catch (error: ErrnoException) {
        throw FileSha256Exception("unreadable", "Open file metadata is unavailable.", error)
      }
      if (!OsConstants.S_ISREG(openedStat.st_mode)) {
        throw FileSha256Exception("not_file", "The SHA-256 source must be a regular file.")
      }
      if (initialStat.st_dev != openedStat.st_dev || initialStat.st_ino != openedStat.st_ino) {
        throw FileSha256Exception(
          "file_changed",
          "File identity changed before hashing started."
        )
      }
      return AndroidOpenFileSha256Source(file, stream, openedStat.st_dev, openedStat.st_ino,
        initialStat.st_size, openedStat.st_size)
    } catch (error: Throwable) {
      try {
        stream.close()
      } catch (closeError: Throwable) {
        error.addSuppressed(closeError)
      }
      throw error
    }
  }

  private fun statPath(file: File) = try {
    Os.stat(file.path)
  } catch (error: ErrnoException) {
    val code = if (error.errno == OsConstants.ENOENT) "not_found" else "unreadable"
    throw FileSha256Exception(code, "File does not exist or cannot be read.", error)
  }
}

private class AndroidOpenFileSha256Source(
  private val file: File,
  private val stream: FileInputStream,
  private val openedDevice: Long,
  private val openedInode: Long,
  override val pathSize: Long,
  override val descriptorSize: Long
) : OpenFileSha256Source {
  override fun read(buffer: ByteArray, offset: Int, length: Int): Int =
    stream.read(buffer, offset, length)

  override fun verifyUnchanged(expectedBytes: Long) {
    val descriptorStat = try {
      Os.fstat(stream.fd)
    } catch (error: ErrnoException) {
      throw FileSha256Exception("file_changed", "Open file metadata is unavailable.", error)
    }
    val pathStat = try {
      Os.stat(file.path)
    } catch (error: ErrnoException) {
      throw FileSha256Exception("file_changed", "File path changed during hashing.", error)
    }
    if (
      descriptorStat.st_dev != openedDevice ||
      descriptorStat.st_ino != openedInode ||
      pathStat.st_dev != openedDevice ||
      pathStat.st_ino != openedInode ||
      descriptorStat.st_size != expectedBytes ||
      pathStat.st_size != expectedBytes
    ) {
      throw FileSha256Exception(
        "file_changed",
        "File identity or size changed before hashing completed."
      )
    }
  }

  override fun close() {
    stream.close()
  }
}
