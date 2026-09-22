package com.anonymous.LiftingLog.notifications

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.bridge.WritableMap

class RestTimerNotificationsModule(
  reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = NAME

  @ReactMethod
  fun showCountdownNotification(
    timerId: String,
    exerciseId: Double,
    exerciseName: String,
    endAtMillis: Double,
    promise: Promise
  ) {
    UiThreadUtil.runOnUiThread {
      try {
        RestTimerNotificationManager.showCountdown(
          context = reactApplicationContext,
          timerId = timerId,
          exerciseId = exerciseId.toInt(),
          exerciseName = exerciseName,
          endAtMillis = endAtMillis.toLong()
        )
        promise.resolve(null)
      } catch (error: Exception) {
        promise.reject(
          "ERR_REST_TIMER_COUNTDOWN",
          "Failed to show countdown notification",
          error
        )
      }
    }
  }

  @ReactMethod
  fun dismissCountdownNotification(timerId: String, exerciseId: Double, promise: Promise) {
    UiThreadUtil.runOnUiThread {
      try {
        RestTimerNotificationManager.dismissCountdown(
          context = reactApplicationContext,
          timerId = timerId,
          exerciseId = exerciseId.toInt()
        )
        promise.resolve(null)
      } catch (error: Exception) {
        promise.reject(
          "ERR_REST_TIMER_DISMISS",
          "Failed to dismiss countdown notification",
          error
        )
      }
    }
  }

  @ReactMethod
  fun showCompletionNotification(
    timerId: String,
    exerciseId: Double,
    exerciseName: String,
    endAtMillis: Double,
    promise: Promise
  ) {
    UiThreadUtil.runOnUiThread {
      try {
        RestTimerNotificationManager.showCompletion(
          context = reactApplicationContext,
          timerId = timerId,
          exerciseId = exerciseId.toInt(),
          exerciseName = exerciseName,
          endAtMillis = endAtMillis.toLong()
        )
        promise.resolve(null)
      } catch (error: Exception) {
        promise.reject(
          "ERR_REST_TIMER_COMPLETE",
          "Failed to show completion notification",
          error
        )
      }
    }
  }

  @ReactMethod
  fun cancelCompletionNotification(timerId: String, exerciseId: Double, promise: Promise) {
    UiThreadUtil.runOnUiThread {
      try {
        RestTimerNotificationManager.cancelCompletion(
          context = reactApplicationContext,
          timerId = timerId,
          exerciseId = exerciseId.toInt()
        )
        promise.resolve(null)
      } catch (error: Exception) {
        promise.reject(
          "ERR_REST_TIMER_CANCEL_COMPLETE",
          "Failed to cancel completion notification",
          error
        )
      }
    }
  }

  @ReactMethod
  fun canScheduleExactAlarms(promise: Promise) {
    UiThreadUtil.runOnUiThread {
      try {
        promise.resolve(RestTimerNotificationManager.canScheduleExactAlarms(reactApplicationContext))
      } catch (error: Exception) {
        promise.reject(
          "ERR_REST_TIMER_EXACT_ALARM_CHECK",
          "Failed to check exact alarm access",
          error
        )
      }
    }
  }

  @ReactMethod
  fun openExactAlarmSettings(promise: Promise) {
    UiThreadUtil.runOnUiThread {
      try {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
          promise.resolve(false)
          return@runOnUiThread
        }

        val intent = Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM).apply {
          data = Uri.parse("package:${reactApplicationContext.packageName}")
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        reactApplicationContext.startActivity(intent)
        promise.resolve(true)
      } catch (error: Exception) {
        promise.reject(
          "ERR_REST_TIMER_EXACT_ALARM_SETTINGS",
          "Failed to open exact alarm settings",
          error
        )
      }
    }
  }

  @ReactMethod
  fun retireRestTimerArtifactsForReplacementRestore(promise: Promise) {
    UiThreadUtil.runOnUiThread {
      try {
        val result = RestTimerNotificationManager.retireRestTimerArtifactsForReplacementRestore(
          reactApplicationContext
        )
        promise.resolve(Arguments.createMap().apply {
          putString("status", "retired")
          putInt("registeredTimersRetired", result.registeredTimersRetired)
          putBoolean("displayedNotificationsCleared", true)
        })
      } catch (error: Exception) {
        promise.reject(
          "ERR_REST_TIMER_RETIRE_RESTORE",
          "Failed to retire rest-timer artifacts for replacement restore",
          error
        )
      }
    }
  }

  @ReactMethod(isBlockingSynchronousMethod = true)
  fun getRestTimerNavigationGeneration(): WritableMap {
    return try {
      val generation = RestTimerNotificationManager.getRestTimerNavigationGeneration(
        reactApplicationContext
      )
      Arguments.createMap().apply {
        putString("status", "available")
        if (generation == null) {
          putNull("generation")
        } else {
          putString("generation", generation)
        }
      }
    } catch (_: Exception) {
      Arguments.createMap().apply {
        putString("status", "unreadable")
        putString("code", ERR_NAVIGATION_GENERATION_UNREADABLE)
      }
    }
  }

  companion object {
    const val NAME = "RestTimerNotifications"
    const val ERR_NAVIGATION_GENERATION_UNREADABLE =
      "ERR_REST_TIMER_NAVIGATION_GENERATION_UNREADABLE"
  }
}
