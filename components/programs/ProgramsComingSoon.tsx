import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../../lib/theme/ThemeContext";

export default function ProgramsComingSoon() {
  const { rawColors } = useTheme();

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <View className="px-4 pt-2">
        <Text className="text-[28px] font-bold text-foreground">Programs</Text>
      </View>
      <View className="flex-1 items-center justify-center px-10 pb-24">
        <View
          className="mb-5 h-20 w-20 items-center justify-center rounded-full bg-surface-secondary"
          accessibilityLabel="Programs coming soon"
        >
          <MaterialCommunityIcons
            name="calendar-clock-outline"
            size={38}
            color={rawColors.primary}
          />
        </View>
        <Text className="text-center text-2xl font-bold text-foreground">Coming Soon</Text>
        <Text className="mt-3 text-center text-base leading-6 text-foreground-secondary">
          Programs are being prepared for a future release.
        </Text>
      </View>
    </SafeAreaView>
  );
}
