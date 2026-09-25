import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { filteredLabel } from '../library-model';
import { useLibraryAppearance } from '../hooks/use-library-appearance';
import type { LibraryQuery } from '../hooks/use-library-query';
import { LibrarySearchActions } from './library-search-actions';
import { LibrarySearchScope } from './library-search-scope';

export function LibraryHeader({ query, onAdd }: { query: LibraryQuery; onAdd: () => void }) {
  const { rawColors, isDark, heroGradient, subtleBorder } = useLibraryAppearance();
  const insets = useSafeAreaInsets();
  const { searchScope, setSearchScope, searchQuery, setSearchQuery, sortOption, sortAscending, setShowSortModal, filteredAndSortedItems } = query;
  const sortSummaryLabel =
    sortOption === "alphabetical"
      ? `A-Z / ${sortAscending ? "Asc" : "Desc"}`
      : `Recent / ${sortAscending ? "Oldest" : "Newest"}`;
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
        <LibrarySearchActions value={searchQuery} onChange={setSearchQuery} onAdd={onAdd} />

        <LibrarySearchScope value={searchScope} onChange={setSearchScope} />

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
