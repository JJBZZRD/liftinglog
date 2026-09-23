import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { filteredLabel, SEARCH_SCOPE_OPTIONS } from '../library-model';
import { useLibraryAppearance } from '../hooks/use-library-appearance';
import type { LibraryQuery } from '../hooks/use-library-query';

export function LibraryHeader({ query }: { query: LibraryQuery }) {
  const { rawColors, isDark, heroGradient, raisedSurface, subtleBorder, lightShadowColor } = useLibraryAppearance();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const { searchScope, setSearchScope, searchQuery, setSearchQuery, sortOption, sortAscending, setShowSortModal, filteredAndSortedItems } = query;
  const selectorTrayWidth = Math.max(280, windowWidth - 40);
  const selectorSegmentWidth = Math.floor((selectorTrayWidth - 8) / 3);
  const selectorSegmentHeight = 36;
  const activeSearchScopeIndex = SEARCH_SCOPE_OPTIONS.findIndex(
    (option) => option.id === searchScope
  );
  const sortSummaryLabel =
    sortOption === "alphabetical"
      ? `A-Z / ${sortAscending ? "Asc" : "Desc"}`
      : `Recent / ${sortAscending ? "Oldest" : "Newest"}`;
  const searchPlaceholder = "Search exercises...";
  return (
    <LinearGradient
      colors={heroGradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{
        paddingTop: insets.top + 22,
        paddingHorizontal: 20,
        paddingBottom: 24,
        borderBottomLeftRadius: 34,
        borderBottomRightRadius: 34,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "flex-start",
          gap: 12,
        }}
      >
        <View style={{ flex: 1 }}>
          <Text
            style={{
              color: rawColors.foreground,
              fontSize: 38,
              lineHeight: 42,
              fontWeight: "700",
              letterSpacing: -1,
            }}
          >
            Exercises
          </Text>
          <Text
            style={{
              marginTop: 6,
              color: rawColors.foregroundSecondary,
              fontSize: 14,
            }}
          >
            Your exercise library
          </Text>
        </View>
      </View>

      <View style={{ marginTop: 20, gap: 14 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            borderRadius: 16,
            backgroundColor: raisedSurface,
            paddingHorizontal: 14,
            paddingVertical: 9,
            borderWidth: 1,
            borderColor: subtleBorder,
            shadowColor: lightShadowColor,
            shadowOffset: { width: 0, height: 10 },
            shadowOpacity: isDark ? 0.14 : 0.12,
            shadowRadius: 24,
            elevation: 4,
          }}
        >
          <MaterialCommunityIcons name="magnify" size={22} color={rawColors.foregroundMuted} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder={searchPlaceholder}
            placeholderTextColor={rawColors.foregroundMuted}
            style={{
              flex: 1,
              color: rawColors.foreground,
              fontSize: 16,
            }}
          />
          {searchQuery.length > 0 ? (
            <Pressable
              onPress={() => setSearchQuery("")}
              hitSlop={10}
              className="active:opacity-80"
            >
              <MaterialCommunityIcons
                name="close-circle"
                size={18}
                color={rawColors.foregroundMuted}
              />
            </Pressable>
          ) : null}
        </View>

        <View
          style={{
            width: selectorTrayWidth,
            borderRadius: 11,
            padding: 3,
            backgroundColor: isDark ? rawColors.surfaceSecondary : "#D9E1EE",
            borderWidth: 1,
            borderColor: isDark ? rawColors.border : "#D1D9E6",
            overflow: "hidden",
            position: "relative",
          }}
        >
          <View
            style={{
              position: "absolute",
              top: 3,
              left: 3 + activeSearchScopeIndex * selectorSegmentWidth,
              width: selectorSegmentWidth,
              height: selectorSegmentHeight,
              borderRadius: 11,
              backgroundColor: raisedSurface,
              borderWidth: 1,
              borderColor: "#E5EAF3",
              shadowColor: lightShadowColor,
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: isDark ? 0.12 : 0.06,
              shadowRadius: 4,
              elevation: 2,
            }}
          />

          <View style={{ width: "100%", flexDirection: "row", alignItems: "center" }}>
            {SEARCH_SCOPE_OPTIONS.map((option) => {
              const isSelected = searchScope === option.id;
              return (
                <View
                  key={option.id}
                  style={{
                    width: selectorSegmentWidth,
                    height: selectorSegmentHeight,
                  }}
                >
                  <Pressable
                    onPress={() => setSearchScope(option.id)}
                    className="active:opacity-80"
                    style={{
                      width: "100%",
                      height: "100%",
                      borderRadius: 11
                    }}
                  >
                    <View
                      style={{
                        width: "100%",
                        height: "100%",
                        alignItems: "center",
                        justifyContent: "center",
                        paddingHorizontal: 12,
                      }}
                    >
                      <Text
                        style={{
                          color: isSelected ? rawColors.primary : rawColors.foregroundSecondary,
                          fontSize: 14,
                          fontWeight: "700",
                          includeFontPadding: false,
                          lineHeight: 16,
                          letterSpacing: 0.8,
                          textAlign: "center",
                          textAlignVertical: "center",
                          textTransform: "uppercase",
                          width: "100%",
                        }}
                      >
                        {option.label}
                      </Text>
                    </View>
                  </Pressable>
                </View>
              );
            })}
          </View>
        </View>

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Text
            style={{
              color: rawColors.foregroundSecondary,
              fontSize: 13,
              fontWeight: "500",
            }}
          >
            {filteredLabel(filteredAndSortedItems.length)}
          </Text>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open sort options"
              onPress={() => setShowSortModal(true)}
              hitSlop={8}
              className="active:opacity-80"
            >
              <Text
                style={{
                  color: rawColors.foregroundMuted,
                  fontSize: 12,
                  fontWeight: "600",
                  letterSpacing: 0.2,
                }}
              >
                {sortSummaryLabel}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open sort options"
              onPress={() => setShowSortModal(true)}
              className="active:opacity-80"
              style={{
                width: 28,
                height: 28,
                borderRadius: 10,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: isDark ? rawColors.surfaceSecondary : "rgba(255,255,255,0.82)",
                borderWidth: 1,
                borderColor: subtleBorder
              }}
            >
              <MaterialCommunityIcons
                name="tune-variant"
                size={16}
                color={rawColors.foregroundSecondary}
              />
            </Pressable>
          </View>
        </View>
      </View>
    </LinearGradient>
  );
}
