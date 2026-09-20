package com.anonymous.LiftingLog.notifications

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider

class RestTimerNotificationsPackage : BaseReactPackage() {
  override fun getModule(
    name: String,
    reactContext: ReactApplicationContext
  ): NativeModule? = when (name) {
    RestTimerNotificationsModule.NAME -> RestTimerNotificationsModule(reactContext)
    else -> null
  }

  override fun getReactModuleInfoProvider(): ReactModuleInfoProvider = ReactModuleInfoProvider {
    mapOf(
      RestTimerNotificationsModule.NAME to ReactModuleInfo(
        RestTimerNotificationsModule.NAME,
        RestTimerNotificationsModule::class.java.name,
        false,
        false,
        false,
        false
      )
    )
  }
}
