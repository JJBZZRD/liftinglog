/* eslint-disable @typescript-eslint/no-require-imports */
import fs from "fs";
import path from "path";

const {
  KOTLIN_TEMPLATES,
} = require("../../scripts/sync-android-rest-timer-native");
const {
  verifyAndroidRestTimerNative,
} = require("../../scripts/verify-android-rest-timer-native");

const projectRoot = path.resolve(__dirname, "../..");
const templateRoot = path.join(projectRoot, "scripts", "android-rest-timer-native");
const generatedRoot = path.join(
  projectRoot,
  "android",
  "app",
  "src",
  "main",
  "java",
  "com",
  "anonymous",
  "LiftingLog",
  "notifications"
);

function read(root: string, filename: string): string {
  return fs.readFileSync(path.join(root, filename), "utf8");
}

describe("Android rest-timer retirement integration", () => {
  it("keeps the registry helper in canonical/generated parity", () => {
    expect(KOTLIN_TEMPLATES).toContain("RestTimerRegistry.kt");
    expect(KOTLIN_TEMPLATES).toContain("RestTimerNavigationGeneration.kt");
    for (const filename of KOTLIN_TEMPLATES) {
      expect(read(generatedRoot, filename)).toBe(read(templateRoot, filename));
    }
  });

  it("persists exact identity before scheduling and routes receivers through validation", () => {
    const manager = read(templateRoot, "RestTimerNotificationManager.kt");
    const registration = manager.indexOf("registry(appContext).register(timerState)");
    const scheduling = manager.indexOf("scheduleCompletion(appContext, timerState)");
    expect(registration).toBeGreaterThanOrEqual(0);
    expect(scheduling).toBeGreaterThan(registration);

    const completionReceiver = read(templateRoot, "RestTimerCompletionReceiver.kt");
    const dismissedReceiver = read(templateRoot, "RestTimerCountdownDismissedReceiver.kt");
    expect(completionReceiver).toContain("handleCompletionDelivery");
    expect(completionReceiver).not.toContain(".showCompletion(");
    expect(dismissedReceiver).toContain("handleCountdownDismissedDelivery");
    expect(dismissedReceiver).not.toContain(".showCountdown(");
    for (const receiver of [completionReceiver, dismissedReceiver]) {
      expect(receiver).toContain("EXTRA_TIMER_ID");
      expect(receiver).toContain("EXTRA_EXERCISE_ID");
      expect(receiver).toContain("hasExtra(RestTimerNotificationManager.EXTRA_END_AT)");
    }
  });

  it("uses strict checked persistence and retires alarms before durable state", () => {
    const registry = read(templateRoot, "RestTimerRegistry.kt");
    expect(registry).toContain("reader.strictness = Strictness.STRICT");
    expect(registry).toContain("class AtomicFileRestTimerRegistryPersistence");
    expect(registry).toContain("Os.lstat(file.path).st_mode");
    expect(registry).toContain("stream.fd.sync()");
    expect(registry).toContain("published.contentEquals(bytes)");
    expect(registry).toContain("readBounded(atomicFile)");
    expect(registry).toContain("Rest-timer registry backup remains after AtomicFile recovery");
    expect(registry).toContain("Rest-timer registry new file remains after AtomicFile recovery");
    expect(registry).toContain("onMalformedInput(CodingErrorAction.REPORT)");
    expect(registry).toContain("requireStrictJsonCharacters(json)");
    expect(registry).not.toContain("getSharedPreferences");

    const physicalDelete = registry.indexOf("AtomicFile(baseFile).delete()");
    const deletionVerification = registry.indexOf(
      "associatedFiles().filter { lstatModeOrNull(it) != null }",
      physicalDelete
    );
    expect(physicalDelete).toBeGreaterThanOrEqual(0);
    expect(deletionVerification).toBeGreaterThan(physicalDelete);

    const openRead = registry.indexOf("atomicFile.openRead().use");
    const postOpenRecoveryCheck = registry.indexOf("requireRecoveredReadState()", openRead);
    const byteRead = registry.indexOf("input.read(", postOpenRecoveryCheck);
    const postReadRecoveryCheck = registry.indexOf("requireRecoveredReadState()", byteRead);
    expect(openRead).toBeGreaterThanOrEqual(0);
    expect(postOpenRecoveryCheck).toBeGreaterThan(openRead);
    expect(byteRead).toBeGreaterThan(postOpenRecoveryCheck);
    expect(postReadRecoveryCheck).toBeGreaterThan(byteRead);

    const cancelAlarm = registry.indexOf("timers.forEach(cancelAlarm)");
    const retireRegistry = registry.indexOf("persistence.remove()", cancelAlarm);
    const clearProcess = registry.indexOf("clearProcessState()", retireRegistry);
    const clearNotifications = registry.indexOf("clearDisplayedNotifications()", clearProcess);
    expect(cancelAlarm).toBeGreaterThanOrEqual(0);
    expect(retireRegistry).toBeGreaterThan(cancelAlarm);
    expect(clearProcess).toBeGreaterThan(retireRegistry);
    expect(clearNotifications).toBeGreaterThan(clearProcess);

    const manager = read(templateRoot, "RestTimerNotificationManager.kt");
    expect(manager).toContain("synchronized(operationLock)");
    expect(manager).toContain("notificationManager.cancelAll()");
    const showCountdown = manager.indexOf("fun showCountdown(");
    const countdownGenerationRead = manager.indexOf(
      "val navigationGeneration = navigationGeneration(appContext).read()",
      showCountdown
    );
    const countdownRegistration = manager.indexOf(
      "registry(appContext).register(timerState)",
      showCountdown
    );
    expect(countdownGenerationRead).toBeGreaterThan(showCountdown);
    expect(countdownRegistration).toBeGreaterThan(countdownGenerationRead);

    const completionDelivery = manager.indexOf("fun handleCompletionDelivery(");
    const completionGenerationRead = manager.indexOf(
      "val navigationGeneration = navigationGeneration(appContext).read()",
      completionDelivery
    );
    const completionRemoval = manager.indexOf(
      "registry(appContext).removeExact(timerId, exerciseId, endAtMillis)",
      completionDelivery
    );
    expect(completionGenerationRead).toBeGreaterThan(completionDelivery);
    expect(completionRemoval).toBeGreaterThan(completionGenerationRead);

    const generation = read(templateRoot, "RestTimerNavigationGeneration.kt");
    const rotate = generation.indexOf("generation.rotate()");
    const retire = generation.indexOf("return registry.retire(", rotate);
    expect(rotate).toBeGreaterThanOrEqual(0);
    expect(retire).toBeGreaterThan(rotate);
    expect(generation).toContain('const val GENERATION_PREFIX = "timer-nav-v1:"');
    expect(generation).toContain("reader.strictness = Strictness.STRICT");
    expect(generation).toContain("val published = read()");
    expect(generation).not.toContain("persistence.remove()");

    expect(registry).toContain('REGISTERED_TIMERS("registered-timers.json")');
    expect(registry).toContain('NAVIGATION_GENERATION("navigation-generation.json")');
  });

  it("exposes the frozen native method and passes the full verifier", async () => {
    const module = read(templateRoot, "RestTimerNotificationsModule.kt");
    expect(module).toContain("fun retireRestTimerArtifactsForReplacementRestore(promise: Promise)");
    expect(module).toContain('"ERR_REST_TIMER_RETIRE_RESTORE"');
    expect(module).toContain('putString("status", "retired")');
    expect(module).toContain('putBoolean("displayedNotificationsCleared", true)');
    expect(module).toContain("@ReactMethod(isBlockingSynchronousMethod = true)");
    expect(module).toContain("fun getRestTimerNavigationGeneration()");

    const manager = read(templateRoot, "RestTimerNotificationManager.kt");
    expect(manager).toContain(
      'appendQueryParameter("navigationGeneration", navigationGeneration)'
    );

    await expect(verifyAndroidRestTimerNative(projectRoot)).resolves.toEqual({
      packageName: "com.anonymous.LiftingLog",
      scheme: "liftinglog",
    });
  });
});
