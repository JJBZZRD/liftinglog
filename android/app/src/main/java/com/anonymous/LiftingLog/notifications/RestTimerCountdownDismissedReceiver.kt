package com.anonymous.LiftingLog.notifications

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import java.io.IOException

class RestTimerCountdownDismissedReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != RestTimerNotificationManager.ACTION_RESTORE_COUNTDOWN) {
      return
    }

    val timerId = intent.getStringExtra(RestTimerNotificationManager.EXTRA_TIMER_ID) ?: return
    val exerciseId = intent.getIntExtra(RestTimerNotificationManager.EXTRA_EXERCISE_ID, -1)
    if (exerciseId < 0 || !intent.hasExtra(RestTimerNotificationManager.EXTRA_END_AT)) {
      return
    }

    val endAtMillis = intent.getLongExtra(RestTimerNotificationManager.EXTRA_END_AT, -1L)

    if (endAtMillis <= System.currentTimeMillis()) {
      return
    }

    try {
      RestTimerNotificationManager.handleCountdownDismissedDelivery(
        context = context,
        timerId = timerId,
        exerciseId = exerciseId,
        endAtMillis = endAtMillis
      )
    } catch (_: IOException) {
      return
    }
  }
}
