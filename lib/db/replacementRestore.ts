import { getNativeProcessToken } from "../native/appProcessIdentity";
import {
  deleteRestoreControlRecord,
  readRestoreControlRecord,
  writeRestoreControlRecord,
} from "../native/restoreControlStore";
import type {
  DiscardSafelyFailedScheduledRestoreOptions,
  RestorePrepareOptions,
  RestoreScheduleOptions,
  RestoreStartupOptions,
  ResumeCommittedStartupFinalizationOptions,
} from "./replacementRestoreContract";
import {
  discardReplacementRestoreCandidate,
  getReplacementRestoreStagingRootUri,
  hashReplacementRestoreCandidate,
  hashReplacementRestoreCandidateSync,
  prepareReplacementCandidate,
  replacementRestoreCandidateExists,
} from "./replacementRestorePreparation";
import {
  createReplacementRestoreRuntime,
  type ReplacementRestoreEngine,
} from "./replacementRestoreRuntime";
import { openValidatedReplacementSession } from "./replacementRestoreTransaction";

let runtime: ReplacementRestoreEngine | undefined;

function getRuntime(): ReplacementRestoreEngine {
  runtime ??= createReplacementRestoreRuntime({
    stagingRootUri: getReplacementRestoreStagingRootUri(),
    prepareCandidate: prepareReplacementCandidate,
    discardCandidate: discardReplacementRestoreCandidate,
    candidateExists: replacementRestoreCandidateExists,
    hashCandidate: hashReplacementRestoreCandidate,
    hashCandidateSync: hashReplacementRestoreCandidateSync,
    getNativeProcessToken,
    readControlRecord: readRestoreControlRecord,
    writeControlRecord: writeRestoreControlRecord,
    deleteControlRecord: deleteRestoreControlRecord,
    openValidatedSession: openValidatedReplacementSession,
  });
  return runtime;
}

export function prepareReplacementRestore(options: RestorePrepareOptions) {
  return getRuntime().prepareReplacementRestore(options);
}

export function scheduleReplacementRestore(options: RestoreScheduleOptions) {
  return getRuntime().scheduleReplacementRestore(options);
}

export function discardPreparedRestore(token: string) {
  return getRuntime().discardPreparedRestore(token);
}

export function cancelScheduledReplacementRestore(restoreId: string) {
  return getRuntime().cancelScheduledReplacementRestore(restoreId);
}

export function discardSafelyFailedScheduledRestore(
  options: DiscardSafelyFailedScheduledRestoreOptions
) {
  return getRuntime().discardSafelyFailedScheduledRestore(options);
}

export function applyScheduledReplacementRestoreAtStartup(
  options: RestoreStartupOptions
) {
  return getRuntime().applyScheduledReplacementRestoreAtStartup(options);
}

export function resumeCommittedStartupFinalization(
  options: ResumeCommittedStartupFinalizationOptions
) {
  return getRuntime().resumeCommittedStartupFinalization(options);
}
