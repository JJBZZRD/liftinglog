import { useWorkoutAssignment } from "./use-workout-assignment";
import { useRecordingContext } from "./use-recording-context";
import { useRecordingSession } from "./use-recording-session";
import { useProgramPersistence } from "./use-program-persistence";
import { useProgramInputs } from "./use-program-inputs";
import { useRecordingActions } from "./use-recording-actions";
import { useRecordingTools } from "./use-recording-tools";

export function useRecordingController(onHistoryRefresh?: () => void) {
  const recording = useRecordingContext(onHistoryRefresh);
  const session = useRecordingSession(recording);
  const programPersistence = useProgramPersistence({ ...recording, ...session });
  const programInputs = useProgramInputs({ ...recording, ...session, ...programPersistence });
  const actions = useRecordingActions({ ...recording, ...session });
  const tools = useRecordingTools({ ...recording, ...session });
  const assignment = useWorkoutAssignment({ ...recording, ...programInputs });
  return {
    ...assignment,
    ...recording,
    ...session,
    ...programPersistence,
    ...programInputs,
    ...actions,
    ...tools,
  };
}
export type RecordingController = ReturnType<typeof useRecordingController>;
