import { Stack } from "expo-router";
import { useTheme } from "../../lib/theme/ThemeContext";
import { WorkoutThemeBoundary } from "../../components/workouts/workout-theme";

export default function CalculatorsLayout() {
  return <WorkoutThemeBoundary><CalculatorsStack /></WorkoutThemeBoundary>;
}

function CalculatorsStack() {
  const { rawColors } = useTheme();

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: rawColors.surface },
        headerTintColor: rawColors.foreground,
        headerTitleStyle: { color: rawColors.foreground },
        contentStyle: { backgroundColor: rawColors.background },
      }}
    >
      <Stack.Screen name="index" options={{ title: "Calculators" }} />
      <Stack.Screen name="1rm-toolkit" options={{ title: "1RM Toolkit" }} />
      <Stack.Screen name="powerlifting-total" options={{ title: "Powerlifting Total" }} />
      <Stack.Screen name="power-score" options={{ title: "Power Score" }} />
      <Stack.Screen name="sinclair" options={{ title: "Sinclair" }} />
      <Stack.Screen name="plate-loader" options={{ title: "Plate Loader" }} />
    </Stack>
  );
}
