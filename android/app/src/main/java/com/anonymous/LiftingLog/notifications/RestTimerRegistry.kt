package com.anonymous.LiftingLog.notifications

import android.content.Context
import android.system.ErrnoException
import android.system.Os
import android.system.OsConstants
import android.util.AtomicFile
import com.google.gson.Strictness
import com.google.gson.stream.JsonReader
import com.google.gson.stream.JsonToken
import com.google.gson.stream.JsonWriter
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileNotFoundException
import java.io.FileOutputStream
import java.io.IOException
import java.io.StringReader
import java.io.StringWriter
import java.nio.ByteBuffer
import java.nio.charset.CodingErrorAction
import java.nio.charset.StandardCharsets

data class RegisteredRestTimer(
  val timerId: String,
  val exerciseId: Int,
  val exerciseName: String,
  val endAtMillis: Long
) {
  init {
    require(timerId.isNotBlank()) { "timerId must not be blank" }
    require(exerciseId >= 0) { "exerciseId must be non-negative" }
    require(endAtMillis > 0L) { "endAtMillis must be positive" }
  }

  fun hasIdentity(timerId: String, exerciseId: Int, endAtMillis: Long): Boolean =
    this.timerId == timerId && this.exerciseId == exerciseId && this.endAtMillis == endAtMillis
}

sealed interface RestTimerRegistryValue {
  data object Missing : RestTimerRegistryValue
  data class Present(val json: String) : RestTimerRegistryValue
}

interface RestTimerRegistryPersistence {
  fun read(): RestTimerRegistryValue
  fun replace(json: String)
  fun remove()
}

object RestTimerRegistryFileCodec {
  const val MAX_REGISTRY_BYTES = 256 * 1024

  fun encode(json: String): ByteArray {
    if (hasUnpairedSurrogate(json)) {
      throw RestTimerRegistryPersistenceException(
        "Rest-timer registry contains an unpaired surrogate"
      )
    }
    val bytes = json.toByteArray(StandardCharsets.UTF_8)
    if (bytes.size > MAX_REGISTRY_BYTES) {
      throw RestTimerRegistryPersistenceException(
        "Rest-timer registry exceeds $MAX_REGISTRY_BYTES UTF-8 bytes"
      )
    }
    return bytes
  }

  fun decode(bytes: ByteArray): String {
    if (bytes.size > MAX_REGISTRY_BYTES) {
      throw RestTimerRegistryPersistenceException("Rest-timer registry is too large")
    }
    return try {
      StandardCharsets.UTF_8
        .newDecoder()
        .onMalformedInput(CodingErrorAction.REPORT)
        .onUnmappableCharacter(CodingErrorAction.REPORT)
        .decode(ByteBuffer.wrap(bytes))
        .toString()
    } catch (error: Exception) {
      throw RestTimerRegistryCorruptException(error)
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
}

class AtomicFileRestTimerRegistryPersistence private constructor(
  context: Context,
  fileName: RestTimerRegistryFileName
) : RestTimerRegistryPersistence {
  constructor(context: Context) : this(context, RestTimerRegistryFileName.REGISTERED_TIMERS)

  private val baseFile = File(
    File(context.applicationContext.filesDir, DIRECTORY_NAME),
    fileName.value
  )

  override fun read(): RestTimerRegistryValue {
    return when (inspectReadState()) {
      ReadState.ABSENT -> RestTimerRegistryValue.Missing
      ReadState.UNPUBLISHED_NEW_ONLY -> throw IOException(
        "Rest-timer registry has unpublished associated state"
      )
      ReadState.COMMITTED_CANDIDATE -> RestTimerRegistryValue.Present(
        RestTimerRegistryFileCodec.decode(readBounded(AtomicFile(baseFile)))
      )
    }
  }

  override fun replace(json: String) {
    val bytes = RestTimerRegistryFileCodec.encode(json)

    ensureDirectory()
    requireRegularAssociatedFiles()
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
            // The caller treats this write as failed and every later read reinspects disk.
          }
        }
      }
      throw RestTimerRegistryPersistenceException(
        "Atomic rest-timer registry write failed",
        error
      )
    }

    val published = try {
      readBounded(atomicFile)
    } catch (error: Exception) {
      throw RestTimerRegistryPersistenceException(
        "Published rest-timer registry could not be verified",
        error
      )
    }
    if (!published.contentEquals(bytes)) {
      throw RestTimerRegistryPersistenceException(
        "Published rest-timer registry differs from requested bytes"
      )
    }
  }

  override fun remove() {
    if (!requireRegistryDirectory()) {
      return
    }
    requireRegularAssociatedFiles()
    try {
      AtomicFile(baseFile).delete()
    } catch (error: Exception) {
      throw RestTimerRegistryPersistenceException(
        "Atomic rest-timer registry delete failed",
        error
      )
    }

    val remnants = associatedFiles().filter { lstatModeOrNull(it) != null }
    if (remnants.isNotEmpty()) {
      throw RestTimerRegistryPersistenceException(
        "Rest-timer registry delete left associated state: " +
          remnants.joinToString { it.name }
      )
    }
  }

  private fun inspectReadState(): ReadState {
    if (!requireRegistryDirectory()) {
      return ReadState.ABSENT
    }
    val baseMode = lstatModeOrNull(baseFile)
    val backupMode = lstatModeOrNull(backupFile())
    val newMode = lstatModeOrNull(newFile())
    for (mode in listOfNotNull(baseMode, backupMode, newMode)) {
      if (!OsConstants.S_ISREG(mode)) {
        throw IOException("Rest-timer registry associated path is not a regular file")
      }
    }
    if (baseMode != null || backupMode != null) {
      return ReadState.COMMITTED_CANDIDATE
    }
    return if (newMode != null) ReadState.UNPUBLISHED_NEW_ONLY else ReadState.ABSENT
  }

  private fun associatedFiles(): List<File> = listOf(baseFile, newFile(), backupFile())

  private fun newFile(): File = File("${baseFile.path}.new")

  private fun backupFile(): File = File("${baseFile.path}.bak")

  private fun requireRegistryDirectory(): Boolean {
    val directory = baseFile.parentFile
      ?: throw IOException("Rest-timer registry directory has no parent")
    val filesDirectory = directory.parentFile
      ?: throw IOException("Application files directory has no parent")
    val filesDirectoryMode = lstatModeOrNull(filesDirectory)
      ?: throw IOException("Application files directory is absent")
    if (!OsConstants.S_ISDIR(filesDirectoryMode)) {
      throw IOException("Application files path is not a directory")
    }

    val directoryMode = lstatModeOrNull(directory) ?: return false
    if (!OsConstants.S_ISDIR(directoryMode)) {
      throw IOException("Rest-timer registry directory path is not a directory")
    }
    return true
  }

  private fun requireRegularAssociatedFiles() {
    for (file in associatedFiles()) {
      val mode = lstatModeOrNull(file) ?: continue
      if (!OsConstants.S_ISREG(mode)) {
        throw IOException(
          "Rest-timer registry associated path is not a regular file: ${file.name}"
        )
      }
    }
  }

  private fun ensureDirectory() {
    val directory = baseFile.parentFile
      ?: throw IOException("Rest-timer registry directory has no parent")
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
        throw IOException("Rest-timer registry directory path is not a directory")
      }
      return
    }
    if (!directory.mkdir()) {
      throw IOException("Could not create rest-timer registry directory")
    }
    val createdMode = lstatModeOrNull(directory)
    if (createdMode == null || !OsConstants.S_ISDIR(createdMode)) {
      throw IOException("Created rest-timer registry path is not a directory")
    }
  }

  private fun lstatModeOrNull(file: File): Int? {
    return try {
      Os.lstat(file.path).st_mode
    } catch (error: ErrnoException) {
      if (error.errno == OsConstants.ENOENT) {
        return null
      }
      throw IOException("Could not inspect rest-timer registry path", error)
    }
  }

  private fun readBounded(atomicFile: AtomicFile): ByteArray {
    try {
      atomicFile.openRead().use { input ->
        requireRecoveredReadState()
        val output = ByteArrayOutputStream()
        val buffer = ByteArray(READ_BUFFER_BYTES)
        var total = 0
        while (true) {
          val maximumRead = minOf(buffer.size, MAX_REGISTRY_BYTES + 1 - total)
          if (maximumRead <= 0) {
            throw RestTimerRegistryPersistenceException("Rest-timer registry is too large")
          }
          val count = input.read(buffer, 0, maximumRead)
          if (count < 0) {
            requireRecoveredReadState()
            return output.toByteArray()
          }
          output.write(buffer, 0, count)
          total += count
          if (total > MAX_REGISTRY_BYTES) {
            throw RestTimerRegistryPersistenceException("Rest-timer registry is too large")
          }
        }
      }
    } catch (error: FileNotFoundException) {
      throw IOException(
        "Rest-timer registry disappeared after physical presence was established",
        error
      )
    }
  }

  private fun requireRecoveredReadState() {
    val baseMode = lstatModeOrNull(baseFile)
      ?: throw IOException("Rest-timer registry base is absent after AtomicFile recovery")
    if (!OsConstants.S_ISREG(baseMode)) {
      throw IOException("Rest-timer registry base is not regular after AtomicFile recovery")
    }
    if (lstatModeOrNull(backupFile()) != null) {
      throw IOException("Rest-timer registry backup remains after AtomicFile recovery")
    }
    if (lstatModeOrNull(newFile()) != null) {
      throw IOException("Rest-timer registry new file remains after AtomicFile recovery")
    }
  }

  private enum class ReadState {
    ABSENT,
    UNPUBLISHED_NEW_ONLY,
    COMMITTED_CANDIDATE,
  }

  companion object {
    const val MAX_REGISTRY_BYTES = RestTimerRegistryFileCodec.MAX_REGISTRY_BYTES
    private const val DIRECTORY_NAME = "rest-timer-registry"
    private const val READ_BUFFER_BYTES = 8 * 1024

    internal fun navigationGeneration(context: Context): RestTimerRegistryPersistence =
      AtomicFileRestTimerRegistryPersistence(
        context,
        RestTimerRegistryFileName.NAVIGATION_GENERATION
      )
  }
}

private enum class RestTimerRegistryFileName(val value: String) {
  REGISTERED_TIMERS("registered-timers.json"),
  NAVIGATION_GENERATION("navigation-generation.json"),
}

data class RestTimerRetirementResult(
  val registeredTimersRetired: Int
)

class RestTimerRegistry(
  private val persistence: RestTimerRegistryPersistence
) {
  fun register(timer: RegisteredRestTimer): List<RegisteredRestTimer> {
    val state = readState()
    val timers = LinkedHashMap(state.timersByExercise)
    timers[timer.exerciseId] = timer
    persist(timers.values.toList())
    return timers.values.toList()
  }

  fun readAll(): List<RegisteredRestTimer> = readState().timersByExercise.values.toList()

  fun findExact(timerId: String, exerciseId: Int, endAtMillis: Long): RegisteredRestTimer? =
    readState().timersByExercise[exerciseId]?.takeIf {
      it.hasIdentity(timerId, exerciseId, endAtMillis)
    }

  fun findByExercise(exerciseId: Int): RegisteredRestTimer? =
    readState().timersByExercise[exerciseId]

  fun removeExact(timerId: String, exerciseId: Int, endAtMillis: Long): RegisteredRestTimer? {
    val state = readState()
    val timer = state.timersByExercise[exerciseId]?.takeIf {
      it.hasIdentity(timerId, exerciseId, endAtMillis)
    } ?: return null
    val remaining = LinkedHashMap(state.timersByExercise)
    remaining.remove(exerciseId)
    persistOrRemove(remaining.values.toList(), state.exists)
    return timer
  }

  fun removeByTimerAndExercise(timerId: String, exerciseId: Int): RegisteredRestTimer? {
    val state = readState()
    val timer = state.timersByExercise[exerciseId]?.takeIf { it.timerId == timerId } ?: return null
    val remaining = LinkedHashMap(state.timersByExercise)
    remaining.remove(exerciseId)
    persistOrRemove(remaining.values.toList(), state.exists)
    return timer
  }

  fun retire(
    cancelAlarm: (RegisteredRestTimer) -> Unit,
    clearProcessState: () -> Unit,
    clearDisplayedNotifications: () -> Unit
  ): RestTimerRetirementResult {
    val state = readState()
    val timers = state.timersByExercise.values.toList()
    timers.forEach(cancelAlarm)
    if (state.exists) {
      persistence.remove()
    }
    clearProcessState()
    clearDisplayedNotifications()
    return RestTimerRetirementResult(registeredTimersRetired = timers.size)
  }

  private fun readState(): RegistryState = when (val value = persistence.read()) {
    RestTimerRegistryValue.Missing -> RegistryState(exists = false, timersByExercise = linkedMapOf())
    is RestTimerRegistryValue.Present -> RegistryState(
      exists = true,
      timersByExercise = decode(value.json)
    )
  }

  private fun persist(timers: List<RegisteredRestTimer>) {
    persistence.replace(encode(timers))
  }

  private fun persistOrRemove(timers: List<RegisteredRestTimer>, previouslyExisted: Boolean) {
    if (timers.isEmpty()) {
      if (previouslyExisted) {
        persistence.remove()
      }
    } else {
      persistence.replace(encode(timers))
    }
  }

  private fun decode(json: String): LinkedHashMap<Int, RegisteredRestTimer> {
    try {
      requireStrictJsonCharacters(json)
      val timers = linkedMapOf<Int, RegisteredRestTimer>()
      var versionSeen = false
      var timersSeen = false
      JsonReader(StringReader(json)).use { reader ->
        reader.strictness = Strictness.STRICT
        reader.beginObject()
        while (reader.hasNext()) {
          when (reader.nextName()) {
            "version" -> {
              if (versionSeen || readIntegerToken(reader) != REGISTRY_VERSION.toLong()) {
                throw RestTimerRegistryCorruptException()
              }
              versionSeen = true
            }
            "timers" -> {
              if (timersSeen) {
                throw RestTimerRegistryCorruptException()
              }
              timersSeen = true
              reader.beginArray()
              while (reader.hasNext()) {
                val timer = readTimer(reader)
                if (timers.put(timer.exerciseId, timer) != null) {
                  throw RestTimerRegistryCorruptException()
                }
              }
              reader.endArray()
            }
            else -> throw RestTimerRegistryCorruptException()
          }
        }
        reader.endObject()
        if (reader.peek() != JsonToken.END_DOCUMENT || !versionSeen || !timersSeen) {
          throw RestTimerRegistryCorruptException()
        }
      }
      return timers
    } catch (error: RestTimerRegistryCorruptException) {
      throw error
    } catch (error: Exception) {
      throw RestTimerRegistryCorruptException(error)
    }
  }

  private fun readTimer(reader: JsonReader): RegisteredRestTimer {
    var timerId: String? = null
    var exerciseId: Int? = null
    var exerciseName: String? = null
    var endAtMillis: Long? = null
    val seenNames = mutableSetOf<String>()
    reader.beginObject()
    while (reader.hasNext()) {
      val name = reader.nextName()
      if (!seenNames.add(name)) {
        throw RestTimerRegistryCorruptException()
      }
      when (name) {
        "timerId" -> timerId = readStringToken(reader)
        "exerciseId" -> {
          val value = readIntegerToken(reader)
          if (value !in 0..Int.MAX_VALUE.toLong()) {
            throw RestTimerRegistryCorruptException()
          }
          exerciseId = value.toInt()
        }
        "exerciseName" -> exerciseName = readStringToken(reader)
        "endAt" -> {
          val value = readIntegerToken(reader)
          if (value <= 0L) {
            throw RestTimerRegistryCorruptException()
          }
          endAtMillis = value
        }
        else -> throw RestTimerRegistryCorruptException()
      }
    }
    reader.endObject()

    val resolvedTimerId = timerId?.takeIf { it.isNotBlank() }
      ?: throw RestTimerRegistryCorruptException()
    return RegisteredRestTimer(
      timerId = resolvedTimerId,
      exerciseId = exerciseId ?: throw RestTimerRegistryCorruptException(),
      exerciseName = exerciseName ?: throw RestTimerRegistryCorruptException(),
      endAtMillis = endAtMillis ?: throw RestTimerRegistryCorruptException()
    )
  }

  private fun readStringToken(reader: JsonReader): String {
    if (reader.peek() != JsonToken.STRING) {
      throw RestTimerRegistryCorruptException()
    }
    return reader.nextString()
  }

  private fun readIntegerToken(reader: JsonReader): Long {
    if (reader.peek() != JsonToken.NUMBER) {
      throw RestTimerRegistryCorruptException()
    }
    val token = reader.nextString()
    if (!INTEGER_PATTERN.matches(token)) {
      throw RestTimerRegistryCorruptException()
    }
    return token.toLongOrNull() ?: throw RestTimerRegistryCorruptException()
  }

  private fun requireStrictJsonCharacters(json: String) {
    var insideString = false
    var escaped = false
    for (character in json) {
      if (!insideString) {
        if (character == '\uFEFF') {
          throw RestTimerRegistryCorruptException()
        }
        if (character == '"') {
          insideString = true
        }
        continue
      }

      if (character.code <= 0x1f) {
        throw RestTimerRegistryCorruptException()
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

  private fun encode(timers: List<RegisteredRestTimer>): String {
    val output = StringWriter()
    JsonWriter(output).use { writer ->
      writer.beginObject()
      writer.name("version").value(REGISTRY_VERSION)
      writer.name("timers").beginArray()
      timers.forEach { timer ->
        writer.beginObject()
        writer.name("timerId").value(timer.timerId)
        writer.name("exerciseId").value(timer.exerciseId)
        writer.name("exerciseName").value(timer.exerciseName)
        writer.name("endAt").value(timer.endAtMillis)
        writer.endObject()
      }
      writer.endArray()
      writer.endObject()
    }
    return output.toString()
  }

  private data class RegistryState(
    val exists: Boolean,
    val timersByExercise: LinkedHashMap<Int, RegisteredRestTimer>
  )

  companion object {
    private const val REGISTRY_VERSION = 1
    private val INTEGER_PATTERN = Regex("-?(0|[1-9][0-9]*)")
  }
}

class RestTimerRegistryCorruptException(
  cause: Throwable? = null
) : IOException("The rest-timer registry is corrupt", cause)

class RestTimerRegistryPersistenceException(
  message: String,
  cause: Throwable? = null
) : IOException(message, cause)
