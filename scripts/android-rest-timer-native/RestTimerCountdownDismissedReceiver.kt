package com.anonymous.LiftingLog.notifications

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class RestTimerCountdownDismissedReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != RestTimerNotificationManager.ACTION_RESTORE_COUNTDOWN) {
      return
    }

    val timerId = intent.getStringExtra(RestTimerNotificationManager.EXTRA_TIMER_ID) ?: return
    val exerciseId = intent.getIntExtra(RestTimerNotificationManager.EXTRA_EXERCISE_ID, -1)
    if (exerciseId < 0) {
      return
    }

    val exerciseName =
      intent.getStringExtra(RestTimerNotificationManager.EXTRA_EXERCISE_NAME) ?: "Exercise"
    val endAtMillis =
      intent.getLongExtra(RestTimerNotificationManager.EXTRA_END_AT, System.currentTimeMillis())

    if (endAtMillis <= System.currentTimeMillis()) {
      return
    }

    RestTimerNotificationManager.showCountdown(
      context = context,
      timerId = timerId,
      exerciseId = exerciseId,
      exerciseName = exerciseName,
      endAtMillis = endAtMillis
    )
  }
}
