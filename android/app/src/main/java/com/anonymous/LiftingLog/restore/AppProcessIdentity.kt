package com.anonymous.LiftingLog.restore

import java.util.UUID

object AppProcessIdentity {
  private val initializationLock = Any()

  @Volatile
  private var processToken: String? = null

  fun initialize() {
    if (processToken != null) {
      return
    }

    synchronized(initializationLock) {
      if (processToken == null) {
        processToken = "process-v1:${UUID.randomUUID()}"
      }
    }
  }

  fun getNativeProcessToken(): String? = processToken
}
