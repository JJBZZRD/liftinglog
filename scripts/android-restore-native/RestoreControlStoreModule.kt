package __ANDROID_PACKAGE__.restore

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap

class RestoreControlStoreModule(
  reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = NAME

  @ReactMethod(isBlockingSynchronousMethod = true)
  fun readRestoreControlRecord(name: String): WritableMap {
    val result = RestoreControlStore.read(reactApplicationContext, name)
    return Arguments.createMap().apply {
      when (result) {
        RestoreControlReadResult.Absent -> putString("status", "absent")
        is RestoreControlReadResult.Present -> {
          putString("status", "present")
          putString("json", result.json)
        }
        is RestoreControlReadResult.Unreadable -> {
          putString("status", "unreadable")
          putString("code", result.code)
        }
      }
    }
  }

  @ReactMethod(isBlockingSynchronousMethod = true)
  fun writeRestoreControlRecord(name: String, json: String): Boolean {
    RestoreControlStore.write(reactApplicationContext, name, json)
    return true
  }

  @ReactMethod(isBlockingSynchronousMethod = true)
  fun deleteRestoreControlRecord(name: String): Boolean {
    RestoreControlStore.delete(reactApplicationContext, name)
    return true
  }

  companion object {
    const val NAME = "RestoreControlStore"
  }
}
