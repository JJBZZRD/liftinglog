package com.anonymous.LiftingLog.notifications

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import java.io.IOException

class RestTimerCompletionReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != RestTimerNotificationManager.ACTION_COMPLETE) {
      return
    }

    val timerId = intent.getStringExtra(RestTimerNotificationManager.EXTRA_TIMER_ID) ?: return
    val exerciseId = intent.getIntExtra(RestTimerNotificationManager.EXTRA_EXERCISE_ID, -1)
    if (exerciseId < 0 || !intent.hasExtra(RestTimerNotificationManager.EXTRA_END_AT)) {
      return
    }

    val endAtMillis = intent.getLongExtra(RestTimerNotificationManager.EXTRA_END_AT, -1L)
    if (endAtMillis <= 0L) {
      return
    }

    try {
      RestTimerNotificationManager.handleCompletionDelivery(
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
