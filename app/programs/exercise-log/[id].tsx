import { useEffect } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { createExercise, getExerciseByName } from "../../../lib/db/exercises";
import {
  getCalendarEntryById,
  getCalendarExerciseById,
  linkExerciseToDb,
} from "../../../lib/db/programCalendar";
import { useTheme } from "../../../lib/theme/ThemeContext";

export default function ProgramExerciseLogRedirect() {
  const { rawColors } = useTheme();
  const params = useLocalSearchParams<{ id?: string; dateIso?: string }>();
  const calendarExerciseId =
    typeof params.id === "string" ? parseInt(params.id, 10) : null;

  useEffect(() => {
    let cancelled = false;

    async function redirectToRecordTab() {
      if (!calendarExerciseId) {
        router.back();
        return;
      }

      const calendarExercise = await getCalendarExerciseById(calendarExerciseId);
      if (!calendarExercise) {
        router.back();
        return;
      }

      let exerciseId = calendarExercise.exerciseId;
      if (!exerciseId) {
        const existingExercise = await getExerciseByName(
          calendarExercise.exerciseName
        );
        exerciseId =
          existingExercise?.id ??
          (await createExercise({ name: calendarExercise.exerciseName }));
        await linkExerciseToDb(calendarExercise.id, exerciseId);
      }

      const calendarEntry = await getCalendarEntryById(
        calendarExercise.calendarId
      );

      if (cancelled) {
        return;
      }

      router.replace({
        pathname: "/exercise/[id]",
        params: {
          id: String(exerciseId),
          name: calendarExercise.exerciseName,
          dateIso:
            typeof params.dateIso === "string"
              ? params.dateIso
              : calendarEntry?.dateIso,
          programExerciseId: String(calendarExercise.id),
          tab: "record",
        },
      });
    }

    void redirectToRecordTab();

    return () => {
      cancelled = true;
    };
  }, [calendarExerciseId, params.dateIso]);

  return (
    <View className="flex-1 items-center justify-center gap-3 bg-background p-6">
      <ActivityIndicator size="small" color={rawColors.primary} />
      <Text className="text-sm text-foreground-secondary" selectable>
        Opening record view...
      </Text>
    </View>
  );
}
