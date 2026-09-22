package __ANDROID_PACKAGE__.restore

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class AppProcessIdentityModule(
  reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = NAME

  @ReactMethod(isBlockingSynchronousMethod = true)
  fun getNativeProcessToken(): String? = AppProcessIdentity.getNativeProcessToken()

  companion object {
    const val NAME = "AppProcessIdentity"
  }
}
