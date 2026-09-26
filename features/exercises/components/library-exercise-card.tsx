import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';
import type { Exercise, ExerciseLibraryGroup } from '@/lib/db/exercises';
import { formatVariationCountLabel } from '@/lib/utils/exerciseVariations';
import { formatMuscleGroupTitle, getEquipmentBadgeLabel, type SearchScope } from '../library-model';
import { useLibraryAppearance } from '../hooks/use-library-appearance';

export function LibraryExerciseCard({ item, isExpanded, searchScope, handleNavigateToExercise, handleOpenActions, handleToggleExpanded }: {
  item: ExerciseLibraryGroup; isExpanded: boolean; searchScope: SearchScope;
  handleNavigateToExercise: (exercise: Exercise) => void;
  handleOpenActions: (group: ExerciseLibraryGroup) => void;
  handleToggleExpanded: (id: number) => void;
}) {
  const { rawColors, isDark, raisedSurface, subtleBorder, lightShadowColor } = useLibraryAppearance();
  const hasVariations = item.variations.length > 0;
  const primaryBadgeLabel =
    searchScope === "equipment"
      ? formatMuscleGroupTitle(item.exercise.muscleGroup).toUpperCase()
      : getEquipmentBadgeLabel(item.exercise);

  return (
    <View
      key={item.exercise.id}
      style={{
        borderRadius: 18,
        backgroundColor: raisedSurface,
        borderWidth: 1,
        borderColor: subtleBorder,
        paddingTop: 8,
        paddingBottom: 8,
        shadowColor: lightShadowColor,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: isDark ? 0.14 : 0.08,
        shadowRadius: 18,
        elevation: 3,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 14,
          paddingVertical: 8,
        }}
      >
        <View
          style={{
            flex: 1,
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            paddingRight: 8,
          }}
        >
          <View
            style={{
              width: 34,
              height: 34,
              borderRadius: 10,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: rawColors.primaryLight,
            }}
          >
            <MaterialCommunityIcons
              name={item.exercise.isBodyweight ? "human-handsup" : "dumbbell"}
              size={18}
              color={rawColors.primary}
            />
          </View>

          <Pressable
            onPress={() => handleNavigateToExercise(item.exercise)}
            onLongPress={() => handleOpenActions(item)}
            className="active:opacity-80"
            style={{
              flex: 1
            }}
          >
            <Text
              numberOfLines={1}
              style={{
                color: rawColors.foreground,
                fontSize: 15,
                lineHeight: 20,
                fontWeight: "600",
              }}
            >
              {item.exercise.name}
            </Text>

            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 8,
                marginTop: 6,
              }}
            >
              <View
                style={{
                  borderRadius: 8,
                  paddingHorizontal: 8,
                  paddingVertical: 3,
                  backgroundColor: rawColors.primaryLight,
                }}
              >
                <Text
                  style={{
                    color: rawColors.primary,
                    fontSize: 10,
                    fontWeight: "700",
                    letterSpacing: 1,
                    textTransform: "uppercase",
                  }}
                >
                  {primaryBadgeLabel}
                </Text>
              </View>

              {hasVariations ? (
                <Text
                  style={{
                    color: rawColors.foregroundSecondary,
                    fontSize: 12,
                  }}
                >
                  {formatVariationCountLabel(item.variations.length)}
                </Text>
              ) : null}
            </View>
          </Pressable>
        </View>

        <View
          style={{
            width: hasVariations ? 74 : 36,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: 2,
          }}
        >
          {hasVariations ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                isExpanded
                  ? `Collapse variations for ${item.exercise.name}`
                  : `Expand variations for ${item.exercise.name}`
              }
              onPress={() => handleToggleExpanded(item.exercise.id)}
              className="active:opacity-80"
              style={{
                width: 36,
                height: 36,
                borderRadius: 12,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "transparent"
              }}
            >
              <MaterialCommunityIcons
                name={isExpanded ? "chevron-up" : "chevron-down"}
                size={20}
                color={rawColors.foregroundSecondary}
              />
            </Pressable>
          ) : null}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Open actions for ${item.exercise.name}`}
            onPress={() => handleOpenActions(item)}
            className="active:opacity-80"
            style={{
              width: 36,
              height: 36,
              borderRadius: 12,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "transparent"
            }}
          >
            <MaterialCommunityIcons
              name="dots-vertical"
              size={18}
              color={rawColors.foregroundSecondary}
            />
          </Pressable>
        </View>
      </View>

      {hasVariations && isExpanded ? (
        <View
          style={{
            paddingTop: 2,
            paddingBottom: 6,
          }}
        >
          <View
            style={{
              height: 1,
              marginHorizontal: 14,
              marginBottom: 2,
              backgroundColor: subtleBorder,
            }}
          />
          {item.variations.map((variation) => (
            <View
              key={variation.id}
              style={{
                paddingHorizontal: 14,
              }}
            >
              <Pressable
                onPress={() => handleNavigateToExercise(variation)}
                className="active:opacity-80"
              >
                <View
                  style={{
                    width: "100%",
                    minHeight: 56,
                    flexDirection: "row",
                    alignItems: "center",
                    paddingVertical: 8,
                  }}
                >
                  <View style={{ width: 42 }} />
                  <View
                    style={{
                      flex: 1,
                      justifyContent: "center",
                      paddingRight: 12,
                    }}
                  >
                    <Text
                      style={{
                        color: rawColors.foreground,
                        fontSize: 15,
                        lineHeight: 20,
                        fontWeight: "500",
                      }}
                    >
                      {variation.name}
                    </Text>
                  </View>
                  <View
                    style={{
                      width: 24,
                      alignItems: "flex-end",
                      justifyContent: "center",
                    }}
                  >
                    <MaterialCommunityIcons
                      name="chevron-right"
                      size={20}
                      color={rawColors.foregroundMuted}
                    />
                  </View>
                </View>
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}
