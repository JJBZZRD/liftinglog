import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';
import type { LibraryController } from '../hooks/use-library-controller';
import type { LibraryQuery } from '../hooks/use-library-query';
import { useLibraryAppearance } from '../hooks/use-library-appearance';
import { LibraryExerciseCard } from './library-exercise-card';

export function LibrarySections({ controller, query }: { controller: LibraryController; query: LibraryQuery }) {
  const { rawColors, isDark, raisedSurface, subtleBorder, lightShadowColor, sectionLabelColor } = useLibraryAppearance();
  const { sections, searchScope } = query;
  const { items, expandedExerciseId, setAddModalVisible, handleNavigateToExercise, handleOpenActions, handleToggleExpanded } = controller;
  return (
    <View style={{ paddingHorizontal: 20, paddingTop: 22, gap: 24 }}>
      {sections.length === 0 ? (
        <View
          style={{
            borderRadius: 26,
            paddingHorizontal: 24,
            paddingVertical: 28,
            alignItems: "center",
            backgroundColor: raisedSurface,
            borderWidth: 1,
            borderColor: subtleBorder,
            shadowColor: lightShadowColor,
            shadowOffset: { width: 0, height: 10 },
            shadowOpacity: isDark ? 0.14 : 0.1,
            shadowRadius: 24,
            elevation: 3,
          }}
        >
          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: 18,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: isDark ? rawColors.primaryLight : "#EEF4FF",
            }}
          >
            <MaterialCommunityIcons
              name="dumbbell"
              size={24}
              color={rawColors.primary}
            />
          </View>
          <Text
            style={{
              marginTop: 16,
              color: rawColors.foreground,
              fontSize: 18,
              fontWeight: "700",
            }}
          >
            {items.length === 0 ? "No exercises yet" : "No matches found"}
          </Text>
          <Text
            style={{
              marginTop: 8,
              textAlign: "center",
              color: rawColors.foregroundSecondary,
              fontSize: 14,
              lineHeight: 20,
            }}
          >
            {items.length === 0
              ? "Create your first exercise to start building out the library."
              : "Try adjusting the search scope or clearing your current query."}
          </Text>
          {items.length === 0 ? (
            <Pressable
              onPress={() => setAddModalVisible(true)}
              className="active:opacity-80"
              style={{
                marginTop: 18,
                paddingHorizontal: 18,
                paddingVertical: 12,
                borderRadius: 16,
                backgroundColor: rawColors.primary
              }}
            >
              <Text
                style={{
                  color: rawColors.primaryForeground,
                  fontSize: 14,
                  fontWeight: "700",
                }}
              >
                Add Exercise
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        sections.map((section) => (
          <View key={section.key} style={{ gap: 12 }}>
            {section.title ? (
              <Text
                style={{
                  color: sectionLabelColor,
                  fontSize: 11,
                  fontWeight: "700",
                  letterSpacing: 2.2,
                  textTransform: "uppercase",
                }}
              >
                {section.title}
              </Text>
            ) : null}

            <View style={{ gap: 14 }}>
              {section.items.map((item) => <LibraryExerciseCard key={item.exercise.id}
                item={item} isExpanded={expandedExerciseId === item.exercise.id} searchScope={searchScope}
                handleNavigateToExercise={handleNavigateToExercise} handleOpenActions={handleOpenActions}
                handleToggleExpanded={handleToggleExpanded} />)}
            </View>
          </View>
        ))
      )}
    </View>

  );
}
