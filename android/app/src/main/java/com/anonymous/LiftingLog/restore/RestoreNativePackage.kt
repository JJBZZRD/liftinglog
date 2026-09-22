package com.anonymous.LiftingLog.restore

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider

class RestoreNativePackage : BaseReactPackage() {
  override fun getModule(
    name: String,
    reactContext: ReactApplicationContext
  ): NativeModule? = when (name) {
    AppProcessIdentityModule.NAME -> AppProcessIdentityModule(reactContext)
    FileSha256Module.NAME -> FileSha256Module(reactContext)
    RestoreControlStoreModule.NAME -> RestoreControlStoreModule(reactContext)
    else -> null
  }

  override fun getReactModuleInfoProvider(): ReactModuleInfoProvider = ReactModuleInfoProvider {
    mapOf(
      AppProcessIdentityModule.NAME to ReactModuleInfo(
        AppProcessIdentityModule.NAME,
        AppProcessIdentityModule::class.java.name,
        false,
        false,
        false,
        false
      ),
      FileSha256Module.NAME to ReactModuleInfo(
        FileSha256Module.NAME,
        FileSha256Module::class.java.name,
        false,
        false,
        false,
        false
      ),
      RestoreControlStoreModule.NAME to ReactModuleInfo(
        RestoreControlStoreModule.NAME,
        RestoreControlStoreModule::class.java.name,
        false,
        false,
        false,
        false
      )
    )
  }
}
