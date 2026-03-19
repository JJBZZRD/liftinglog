package com.anonymous.LiftingLog.notifications

import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.BitmapShader
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Rect
import android.graphics.Shader
import android.net.Uri
import android.os.Build
import android.os.SystemClock
import android.widget.RemoteViews
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.anonymous.LiftingLog.MainActivity
import com.anonymous.LiftingLog.R
import java.util.concurrent.ConcurrentHashMap
import kotlin.math.roundToInt

object RestTimerNotificationManager {
  const val ACTION_COMPLETE = "com.anonymous.LiftingLog.REST_TIMER_COMPLETE"
  const val ACTION_RESTORE_COUNTDOWN = "com.anonymous.LiftingLog.REST_TIMER_RESTORE_COUNTDOWN"
  const val EXTRA_TIMER_ID = "timerId"
  const val EXTRA_EXERCISE_ID = "exerciseId"
  const val EXTRA_EXERCISE_NAME = "exerciseName"
  const val EXTRA_END_AT = "endAt"

  private const val COUNTDOWN_CHANNEL_ID = "rest-timer"
  private const val COMPLETION_CHANNEL_ID = "rest-timer-complete"
  private const val LEGACY_SUMMARY_NOTIFICATION_ID = 10_000
  private const val COUNTDOWN_NOTIFICATION_ID_BASE = 11_000

  private data class ActiveTimerState(
    val timerId: String,
    val exerciseId: Int,
    val exerciseName: String,
    val endAtMillis: Long
  )

  private val activeTimersByExercise = ConcurrentHashMap<Int, ActiveTimerState>()
  @Volatile private var cachedLargeIcon: Bitmap? = null

  fun showCountdown(
    context: Context,
    timerId: String,
    exerciseId: Int,
    exerciseName: String,
    endAtMillis: Long
  ) {
    val appContext = context.applicationContext
    ensureNotificationChannels(appContext)

    val timerState = ActiveTimerState(
      timerId = timerId,
      exerciseId = exerciseId,
      exerciseName = exerciseName,
      endAtMillis = endAtMillis
    )

    activeTimersByExercise[exerciseId] = timerState
    cancelScheduledCompletion(appContext, exerciseId)
    NotificationManagerCompat.from(appContext).cancel(completionNotificationId(exerciseId))
    scheduleCompletion(appContext, timerState)
    refreshCountdownNotifications(appContext)
  }

  fun dismissCountdown(context: Context, timerId: String, exerciseId: Int) {
    val appContext = context.applicationContext
    val activeTimerState = activeTimersByExercise[exerciseId]
    if (activeTimerState != null && activeTimerState.timerId != timerId) {
      return
    }

    val notificationManager = NotificationManagerCompat.from(appContext)
    notificationManager.cancel(LEGACY_SUMMARY_NOTIFICATION_ID)
    notificationManager.cancel(countdownNotificationId(exerciseId))
  }

  fun cancelCompletion(context: Context, timerId: String, exerciseId: Int) {
    val appContext = context.applicationContext
    val activeTimerState = activeTimersByExercise[exerciseId]
    if (activeTimerState != null && activeTimerState.timerId != timerId) {
      return
    }

    activeTimersByExercise.remove(exerciseId)
    cancelScheduledCompletion(appContext, exerciseId)
    val notificationManager = NotificationManagerCompat.from(appContext)
    notificationManager.cancel(LEGACY_SUMMARY_NOTIFICATION_ID)
    notificationManager.cancel(countdownNotificationId(exerciseId))
    notificationManager.cancel(completionNotificationId(exerciseId))
    refreshCountdownNotifications(appContext)
  }

  fun showCompletion(
    context: Context,
    timerId: String,
    exerciseId: Int,
    exerciseName: String,
    endAtMillis: Long
  ) {
    val appContext = context.applicationContext
    val activeTimerState = activeTimersByExercise[exerciseId]
    if (activeTimerState != null && activeTimerState.timerId != timerId) {
      return
    }

    activeTimersByExercise.remove(exerciseId)
    cancelScheduledCompletion(appContext, exerciseId)
    val notificationManager = NotificationManagerCompat.from(appContext)
    notificationManager.cancel(LEGACY_SUMMARY_NOTIFICATION_ID)
    notificationManager.cancel(countdownNotificationId(exerciseId))
    notificationManager.notify(
      completionNotificationId(exerciseId),
      buildCompletionNotification(appContext, timerId, exerciseId, exerciseName, endAtMillis)
    )
    refreshCountdownNotifications(appContext)
  }

  private fun scheduleCompletion(context: Context, timerState: ActiveTimerState) {
    val alarmManager = context.getSystemService(AlarmManager::class.java) ?: return
    val completionPendingIntent = buildCompletionBroadcastPendingIntent(context, timerState)
    val triggerAtElapsedRealtime = buildCompletionTriggerElapsedRealtime(timerState.endAtMillis)

    if (canScheduleExactAlarms(context)) {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
        alarmManager.setExactAndAllowWhileIdle(
          AlarmManager.ELAPSED_REALTIME_WAKEUP,
          triggerAtElapsedRealtime,
          completionPendingIntent
        )
      } else {
        alarmManager.setExact(
          AlarmManager.ELAPSED_REALTIME_WAKEUP,
          triggerAtElapsedRealtime,
          completionPendingIntent
        )
      }
      return
    }

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      alarmManager.setAndAllowWhileIdle(
        AlarmManager.ELAPSED_REALTIME_WAKEUP,
        triggerAtElapsedRealtime,
        completionPendingIntent
      )
    } else {
      alarmManager.set(
        AlarmManager.ELAPSED_REALTIME_WAKEUP,
        triggerAtElapsedRealtime,
        completionPendingIntent
      )
    }
  }

  private fun cancelScheduledCompletion(context: Context, exerciseId: Int) {
    val alarmManager = context.getSystemService(AlarmManager::class.java)
    val completionPendingIntent = buildCompletionBroadcastPendingIntent(context, exerciseId)
    alarmManager?.cancel(completionPendingIntent)
    completionPendingIntent.cancel()
  }

  private fun refreshCountdownNotifications(context: Context) {
    val activeTimers = activeTimersByExercise.values.sortedBy { it.endAtMillis }
    val notificationManager = NotificationManagerCompat.from(context)
    notificationManager.cancel(LEGACY_SUMMARY_NOTIFICATION_ID)

    if (activeTimers.isEmpty()) {
      return
    }

    activeTimers.forEach { timerState ->
      notificationManager.notify(
        countdownNotificationId(timerState.exerciseId),
        buildCountdownNotification(context, timerState)
      )
    }
  }

  private fun buildCountdownNotification(
    context: Context,
    timerState: ActiveTimerState
  ): android.app.Notification {
    val compactContentView =
      buildCountdownCompactRemoteViews(context, timerState.exerciseName, timerState.endAtMillis)
    val expandedContentView =
      buildCountdownExpandedRemoteViews(context, timerState.exerciseName, timerState.endAtMillis)

    val builder = NotificationCompat.Builder(context, COUNTDOWN_CHANNEL_ID)
      .setSmallIcon(R.drawable.rest_timer_notification_icon)
      .setLargeIcon(getLargeIcon(context))
      .setContentTitle(timerState.exerciseName)
      .setContentText("Rest timer running")
      .setContentIntent(
        buildContentIntent(
          context = context,
          requestCode = countdownNotificationId(timerState.exerciseId),
          timerId = timerState.timerId,
          exerciseId = timerState.exerciseId,
          exerciseName = timerState.exerciseName,
          endAtMillis = timerState.endAtMillis
        )
      )
      .setWhen(timerState.endAtMillis)
      .setShowWhen(true)
      .setUsesChronometer(true)
      .setChronometerCountDown(true)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setSilent(true)
      .setAutoCancel(false)
      .setDeleteIntent(buildCountdownDeletePendingIntent(context, timerState))
      .setCategory(NotificationCompat.CATEGORY_PROGRESS)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setCustomContentView(compactContentView)
      .setCustomBigContentView(expandedContentView)
      .setStyle(NotificationCompat.DecoratedCustomViewStyle())

    return builder.build()
  }

  private fun buildCountdownCompactRemoteViews(
    context: Context,
    exerciseName: String,
    endAtMillis: Long
  ): RemoteViews = RemoteViews(
    context.packageName,
    R.layout.rest_timer_countdown_notification_compact
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

  private fun buildCountdownExpandedRemoteViews(
    context: Context,
    exerciseName: String,
    endAtMillis: Long
  ): RemoteViews = RemoteViews(
    context.packageName,
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
    context: Context,
    timerId: String,
    exerciseId: Int,
    exerciseName: String,
    endAtMillis: Long
  ) = NotificationCompat.Builder(context, COMPLETION_CHANNEL_ID)
    .setSmallIcon(R.drawable.rest_timer_notification_icon)
    .setLargeIcon(getLargeIcon(context))
    .setContentTitle("$exerciseName Timer finished")
    .setContentText("Tap to return to this exercise")
    .setContentIntent(
      buildContentIntent(
        context = context,
        requestCode = completionNotificationId(exerciseId),
        timerId = timerId,
        exerciseId = exerciseId,
        exerciseName = exerciseName,
        endAtMillis = endAtMillis
      )
    )
    .setAutoCancel(true)
    .setPriority(NotificationCompat.PRIORITY_HIGH)
    .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
    .build()

  private fun buildContentIntent(
    context: Context,
    requestCode: Int,
    timerId: String,
    exerciseId: Int,
    exerciseName: String,
    endAtMillis: Long
  ) = PendingIntent.getActivity(
    context,
    requestCode,
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
      context,
      MainActivity::class.java
    ).apply {
      addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)
      addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    },
    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
  )

  private fun buildCompletionBroadcastPendingIntent(
    context: Context,
    timerState: ActiveTimerState
  ): PendingIntent = PendingIntent.getBroadcast(
    context,
    completionRequestCode(timerState.exerciseId),
    buildCompletionBroadcastIntent(
      context = context,
      exerciseId = timerState.exerciseId
    ).apply {
      putExtra(EXTRA_TIMER_ID, timerState.timerId)
      putExtra(EXTRA_EXERCISE_ID, timerState.exerciseId)
      putExtra(EXTRA_EXERCISE_NAME, timerState.exerciseName)
      putExtra(EXTRA_END_AT, timerState.endAtMillis)
    },
    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
  )

  private fun buildCountdownDeletePendingIntent(
    context: Context,
    timerState: ActiveTimerState
  ): PendingIntent = PendingIntent.getBroadcast(
    context,
    restoreRequestCode(timerState.exerciseId),
    buildCountdownDeleteIntent(
      context = context,
      exerciseId = timerState.exerciseId
    ).apply {
      putExtra(EXTRA_TIMER_ID, timerState.timerId)
      putExtra(EXTRA_EXERCISE_ID, timerState.exerciseId)
      putExtra(EXTRA_EXERCISE_NAME, timerState.exerciseName)
      putExtra(EXTRA_END_AT, timerState.endAtMillis)
    },
    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
  )

  private fun buildCompletionBroadcastPendingIntent(
    context: Context,
    exerciseId: Int
  ): PendingIntent = PendingIntent.getBroadcast(
    context,
    completionRequestCode(exerciseId),
    buildCompletionBroadcastIntent(context, exerciseId),
    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
  )

  private fun buildCompletionBroadcastIntent(
    context: Context,
    exerciseId: Int
  ) = Intent(context, RestTimerCompletionReceiver::class.java).apply {
    action = ACTION_COMPLETE
    data = Uri.Builder()
      .scheme("LiftingLog")
      .authority("rest-timer-complete")
      .appendPath(exerciseId.toString())
      .build()
  }

  private fun buildCountdownDeleteIntent(
    context: Context,
    exerciseId: Int
  ) = Intent(context, RestTimerCountdownDismissedReceiver::class.java).apply {
    action = ACTION_RESTORE_COUNTDOWN
    data = Uri.Builder()
      .scheme("LiftingLog")
      .authority("rest-timer-dismissed")
      .appendPath(exerciseId.toString())
      .build()
  }

  private fun ensureNotificationChannels(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
      return
    }

    val notificationManager = context.getSystemService(NotificationManager::class.java)

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

  fun canScheduleExactAlarms(context: Context): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
      return true
    }

    val alarmManager = context.getSystemService(AlarmManager::class.java) ?: return false
    return alarmManager.canScheduleExactAlarms()
  }

  private fun getLargeIcon(context: Context): Bitmap? {
    cachedLargeIcon?.let { return it }

    val sourceBitmap =
      BitmapFactory.decodeResource(context.resources, R.drawable.splashscreen_logo) ?: return null
    val backgroundColor = sourceBitmap.getPixel(0, 0)
    val contentBounds = findContentBounds(sourceBitmap, backgroundColor)
    val croppedBitmap = Bitmap.createBitmap(
      sourceBitmap,
      contentBounds.left,
      contentBounds.top,
      contentBounds.width(),
      contentBounds.height()
    )
    val size = maxOf(croppedBitmap.width, croppedBitmap.height)
    val squareBitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
    Canvas(squareBitmap).apply {
      drawColor(backgroundColor)
      drawBitmap(
        croppedBitmap,
        (size - croppedBitmap.width) / 2f,
        (size - croppedBitmap.height) / 2f,
        null
      )
    }
    val outputBitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
    val shader = BitmapShader(squareBitmap, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP)
    val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      this.shader = shader
    }

    Canvas(outputBitmap).drawCircle(size / 2f, size / 2f, size / 2f, paint)
    cachedLargeIcon = outputBitmap
    return outputBitmap
  }

  private fun findContentBounds(bitmap: Bitmap, backgroundColor: Int): Rect {
    var minX = bitmap.width
    var minY = bitmap.height
    var maxX = -1
    var maxY = -1

    for (y in 0 until bitmap.height) {
      for (x in 0 until bitmap.width) {
        if (!isContentPixel(bitmap.getPixel(x, y), backgroundColor)) {
          continue
        }

        if (x < minX) minX = x
        if (y < minY) minY = y
        if (x > maxX) maxX = x
        if (y > maxY) maxY = y
      }
    }

    if (maxX < minX || maxY < minY) {
      return Rect(0, 0, bitmap.width, bitmap.height)
    }

    val padding = (maxOf(maxX - minX + 1, maxY - minY + 1) * 0.05f).roundToInt().coerceAtLeast(4)
    return Rect(
      (minX - padding).coerceAtLeast(0),
      (minY - padding).coerceAtLeast(0),
      (maxX + padding + 1).coerceAtMost(bitmap.width),
      (maxY + padding + 1).coerceAtMost(bitmap.height)
    )
  }

  private fun isContentPixel(pixelColor: Int, backgroundColor: Int): Boolean {
    if (Color.alpha(pixelColor) < 24) {
      return false
    }

    val redDelta = Color.red(pixelColor) - Color.red(backgroundColor)
    val greenDelta = Color.green(pixelColor) - Color.green(backgroundColor)
    val blueDelta = Color.blue(pixelColor) - Color.blue(backgroundColor)
    val colorDistanceSquared =
      (redDelta * redDelta) + (greenDelta * greenDelta) + (blueDelta * blueDelta)

    return colorDistanceSquared > (18 * 18)
  }

  private fun buildCompletionTriggerElapsedRealtime(endAtMillis: Long): Long {
    val remainingDuration = maxOf(0L, endAtMillis - System.currentTimeMillis())
    return SystemClock.elapsedRealtime() + remainingDuration
  }

  private fun countdownNotificationId(exerciseId: Int): Int = COUNTDOWN_NOTIFICATION_ID_BASE + exerciseId

  private fun completionNotificationId(exerciseId: Int): Int = 20_000 + exerciseId

  private fun completionRequestCode(exerciseId: Int): Int = 30_000 + exerciseId

  private fun restoreRequestCode(exerciseId: Int): Int = 40_000 + exerciseId
}
