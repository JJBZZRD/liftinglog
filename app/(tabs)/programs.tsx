import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../../lib/theme/ThemeContext";

export default function ProgramsScreen() {
  const { rawColors } = useTheme();

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <View className="flex-1 px-4">
        <View className="pt-3 mb-6">
          <Text className="text-[32px] leading-[38px] font-bold text-foreground">Programs</Text>
          <Text className="text-base mt-1 text-foreground-secondary">
            Your workout programs
          </Text>
        </View>
        <View className="flex-1 justify-center items-center pb-[100px]">
          <MaterialCommunityIcons name="book-outline" size={64} color={rawColors.foregroundMuted} />
          <Text className="text-lg font-semibold mt-4 text-foreground-muted">
            No programs yet
          </Text>
          <Text className="text-sm mt-2 text-center max-w-[280px] text-foreground-muted">
            Create custom workout programs to structure your training
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}
