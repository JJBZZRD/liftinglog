import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';
import { useTheme } from '@/lib/theme/ThemeContext';

export function WorkoutError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { rawColors } = useTheme();
  return <View style={{ gap: 10, paddingVertical: 12 }}>
    <Text accessibilityRole="alert" selectable style={{ color: rawColors.destructive, fontSize: 14, lineHeight: 21 }}>{message}</Text>
    {onRetry && <Pressable onPress={onRetry} accessibilityRole="button" style={{ alignSelf: 'flex-start', paddingVertical: 8 }}>
      <Text style={{ color: rawColors.primary, fontWeight: '600' }}>Try again</Text>
    </Pressable>}
  </View>;
}

export function WorkoutEmpty({ title, description }: { title: string; description: string }) {
  const { rawColors } = useTheme();
  return <View style={{ borderWidth: 1, borderColor: rawColors.border, borderStyle: 'dashed', borderRadius: 18, padding: 28, alignItems: 'center', gap: 12 }}>
    <MaterialCommunityIcons name="dumbbell" size={32} color={rawColors.foregroundMuted} />
    <Text style={{ color: rawColors.foreground, fontSize: 19, fontWeight: '600', textAlign: 'center' }}>{title}</Text>
    <Text style={{ color: rawColors.foregroundSecondary, fontSize: 14, lineHeight: 22, textAlign: 'center', maxWidth: 270 }}>{description}</Text>
  </View>;
}
