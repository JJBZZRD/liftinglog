package com.anonymous.LiftingLog.notifications

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.widget.RemoteViews
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.anonymous.LiftingLog.MainActivity
import com.anonymous.LiftingLog.R
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.UiThreadUtil
import java.util.concurrent.ConcurrentHashMap

class RestTimerNotificationsModule(
  reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {

  private data class ActiveTimerState(
    val timerId: String,
    val exerciseName: String,
    val endAtMillis: Long
  )

  override fun getName(): String = MODULE_NAME

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
        val exerciseIdInt = exerciseId.toInt()
        val endAt = endAtMillis.toLong()
        val notificationManager = NotificationManagerCompat.from(reactApplicationContext)

        ensureNotificationChannels()
        activeTimersByExercise[exerciseIdInt] = ActiveTimerState(
          timerId = timerId,
          exerciseName = exerciseName,
          endAtMillis = endAt
        )
        cancelScheduledCompletion(exerciseIdInt)
        notificationManager.cancel(completionNotificationId(exerciseIdInt))
        scheduleCompletionNotification(
          timerId = timerId,
          exerciseId = exerciseIdInt,
          exerciseName = exerciseName,
          endAtMillis = endAt
        )
        refreshCountdownNotifications()
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
        val exerciseIdInt = exerciseId.toInt()
        val activeTimerState = activeTimersByExercise[exerciseIdInt]
        if (activeTimerState == null || activeTimerState.timerId == timerId) {
          NotificationManagerCompat.from(reactApplicationContext)
            .cancel(countdownNotificationId(exerciseIdInt))
        }
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
        val exerciseIdInt = exerciseId.toInt()
        showCompletionNotificationInternal(
          timerId = timerId,
          exerciseId = exerciseIdInt,
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
        val exerciseIdInt = exerciseId.toInt()
        val activeTimerState = activeTimersByExercise[exerciseIdInt]
        if (activeTimerState == null || activeTimerState.timerId == timerId) {
          activeTimersByExercise.remove(exerciseIdInt)
          cancelScheduledCompletion(exerciseIdInt)
          val notificationManager = NotificationManagerCompat.from(reactApplicationContext)
          notificationManager.cancel(countdownNotificationId(exerciseIdInt))
          notificationManager.cancel(completionNotificationId(exerciseIdInt))
          refreshCountdownNotifications()
        }
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

  private fun buildCountdownRemoteViews(
    exerciseName: String,
    endAtMillis: Long
  ): RemoteViews = RemoteViews(
    reactApplicationContext.packageName,
    R.layout.rest_timer_countdown_notification
  ).apply {
    val remainingDuration = maxOf(0L, endAtMillis - System.currentTimeMillis())
    val chronometerBase = SystemClock.elapsedRealtime() + remainingDuration
    setTextViewText(R.id.rest_timer_title, exerciseName)
    setChronometer(
      R.id.rest_timer_chronometer,
      chronometerBase,
      null,
      true
    )
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
      setChronometerCountDown(R.id.rest_timer_chronometer, true)
    }
  }

  private fun buildCompletionNotification(
    timerId: String,
    exerciseId: Int,
    exerciseName: String,
    endAtMillis: Long
  ) = NotificationCompat.Builder(reactApplicationContext, COMPLETION_CHANNEL_ID)
    .setSmallIcon(R.mipmap.ic_launcher)
    .setContentTitle("$exerciseName Timer finished")
    .setContentText("Tap to return to this exercise")
    .setContentIntent(buildContentIntent(timerId, exerciseId, exerciseName, endAtMillis))
    .setAutoCancel(true)
    .setPriority(NotificationCompat.PRIORITY_HIGH)
    .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
    .build()

  private fun buildCountdownNotification(
    exerciseId: Int,
    activeTimerState: ActiveTimerState,
    useSystemTemplate: Boolean
  ) = NotificationCompat.Builder(reactApplicationContext, COUNTDOWN_CHANNEL_ID)
    .setSmallIcon(R.mipmap.ic_launcher)
    .setContentTitle(activeTimerState.exerciseName)
    .setContentText("Rest timer running")
    .setContentIntent(
      buildContentIntent(
        activeTimerState.timerId,
        exerciseId,
        activeTimerState.exerciseName,
        activeTimerState.endAtMillis
      )
    )
    .setWhen(activeTimerState.endAtMillis)
    .setShowWhen(true)
    .setUsesChronometer(true)
    .setChronometerCountDown(true)
    .setOngoing(true)
    .setOnlyAlertOnce(true)
    .setSilent(true)
    .setAutoCancel(false)
    .setCategory(NotificationCompat.CATEGORY_PROGRESS)
    .setPriority(NotificationCompat.PRIORITY_LOW)
    .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
    .setTimeoutAfter(
      maxOf(0L, activeTimerState.endAtMillis - System.currentTimeMillis()) + 500L
    )
    .apply {
      if (!useSystemTemplate) {
        val contentView =
          buildCountdownRemoteViews(activeTimerState.exerciseName, activeTimerState.endAtMillis)
        setCustomContentView(contentView)
        setCustomBigContentView(contentView)
        setStyle(NotificationCompat.DecoratedCustomViewStyle())
      }
    }
    .build()

  private fun scheduleCompletionNotification(
    timerId: String,
    exerciseId: Int,
    exerciseName: String,
    endAtMillis: Long
  ) {
    val delayMillis = maxOf(0L, endAtMillis - System.currentTimeMillis())
    val completionRunnable = Runnable {
      completionRunnablesByExercise.remove(exerciseId)
      showCompletionNotificationInternal(
        timerId = timerId,
        exerciseId = exerciseId,
        exerciseName = exerciseName,
        endAtMillis = endAtMillis
      )
    }
    completionRunnablesByExercise[exerciseId] = completionRunnable
    mainHandler.postDelayed(completionRunnable, delayMillis)
  }

  private fun cancelScheduledCompletion(exerciseId: Int) {
    val completionRunnable = completionRunnablesByExercise.remove(exerciseId) ?: return
    mainHandler.removeCallbacks(completionRunnable)
  }

  private fun refreshCountdownNotifications() {
    val activeTimers = activeTimersByExercise.entries.toList()
    if (activeTimers.isEmpty()) {
      return
    }

    ensureNotificationChannels()
    val notificationManager = NotificationManagerCompat.from(reactApplicationContext)
    val useSystemTemplate = activeTimers.size > 1
    activeTimers.forEach { entry ->
      notificationManager.notify(
        countdownNotificationId(entry.key),
        buildCountdownNotification(entry.key, entry.value, useSystemTemplate)
      )
    }
  }

  private fun showCompletionNotificationInternal(
    timerId: String,
    exerciseId: Int,
    exerciseName: String,
    endAtMillis: Long
  ) {
    val activeTimerState = activeTimersByExercise[exerciseId]
    if (activeTimerState != null && activeTimerState.timerId != timerId) {
      return
    }

    activeTimersByExercise.remove(exerciseId)
    cancelScheduledCompletion(exerciseId)
    val notificationManager = NotificationManagerCompat.from(reactApplicationContext)
    notificationManager.cancel(countdownNotificationId(exerciseId))
    notificationManager.notify(
      completionNotificationId(exerciseId),
      buildCompletionNotification(
        timerId = timerId,
        exerciseId = exerciseId,
        exerciseName = exerciseName,
        endAtMillis = endAtMillis
      )
    )
    refreshCountdownNotifications()
  }

  private fun buildContentIntent(
    timerId: String,
    exerciseId: Int,
    exerciseName: String,
    endAtMillis: Long
  ) = android.app.PendingIntent.getActivity(
    reactApplicationContext,
    countdownNotificationId(exerciseId),
    Intent(
      Intent.ACTION_VIEW,
      Uri.Builder()
        .scheme("LiftingLog")
        .authority("exercise")
        .appendPath(exerciseId.toString())
        .appendQueryParameter("name", exerciseName)
        .appendQueryParameter("tab", "record")
        .appendQueryParameter("source", "notification")
        .appendQueryParameter("timerId", timerId)
        .appendQueryParameter("endAt", endAtMillis.toString())
        .build(),
      reactApplicationContext,
      MainActivity::class.java
    ).apply {
      addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)
      addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    },
    android.app.PendingIntent.FLAG_UPDATE_CURRENT or android.app.PendingIntent.FLAG_IMMUTABLE
  )

  private fun ensureNotificationChannels() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
      return
    }

    val notificationManager =
      reactApplicationContext.getSystemService(NotificationManager::class.java)

    val countdownChannel = NotificationChannel(
      COUNTDOWN_CHANNEL_ID,
      "Rest Timer",
      NotificationManager.IMPORTANCE_LOW
    ).apply {
      description = "Ongoing countdown notifications for rest timers"
      setSound(null, null)
      enableVibration(false)
      setShowBadge(false)
    }

    val completionChannel = NotificationChannel(
      COMPLETION_CHANNEL_ID,
      "Rest Timer Complete",
      NotificationManager.IMPORTANCE_HIGH
    ).apply {
      description = "Completion notifications for rest timers"
      enableVibration(true)
      setShowBadge(true)
    }

    notificationManager.createNotificationChannel(countdownChannel)
    notificationManager.createNotificationChannel(completionChannel)
  }

  companion object {
    private const val MODULE_NAME = "RestTimerNotifications"
    private const val COUNTDOWN_CHANNEL_ID = "rest-timer"
    private const val COMPLETION_CHANNEL_ID = "rest-timer-complete"

    private val activeTimersByExercise = ConcurrentHashMap<Int, ActiveTimerState>()
    private val completionRunnablesByExercise = ConcurrentHashMap<Int, Runnable>()
    private val mainHandler = Handler(Looper.getMainLooper())

    private fun countdownNotificationId(exerciseId: Int): Int = 10_000 + exerciseId

    private fun completionNotificationId(exerciseId: Int): Int = 20_000 + exerciseId
  }
}
