import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, Switch, Text, View } from 'react-native';
import AppModal from '@/components/modals/BaseModal';
import { useLibraryAppearance } from '../hooks/use-library-appearance';
import type { LibraryQuery } from '../hooks/use-library-query';

export function LibrarySortDialog({ query }: { query: LibraryQuery }) {
  const { rawColors } = useLibraryAppearance();
  const { showSortModal, setShowSortModal, sortOption, setSortOption, sortAscending, setSortAscending, showAllTabBodyPartGrouping, handleShowAllTabBodyPartGroupingChange } = query;
  return (
    <AppModal visible={showSortModal} onClose={() => setShowSortModal(false)} maxWidth={380}>
      <Text
        style={{
          color: rawColors.foreground,
          fontSize: 22,
          fontWeight: "700",
        }}
      >
        Sort & Filter
      </Text>
      <Text
        style={{
          marginTop: 6,
          color: rawColors.foregroundSecondary,
          fontSize: 14,
          lineHeight: 20,
        }}
      >
        Choose how the library is ordered and shown.
      </Text>

      <View style={{ marginTop: 18, gap: 10 }}>
        {[
          {
            id: "alphabetical" as const,
            label: "Alphabetical",
            icon: "sort-alphabetical-ascending" as const,
          },
          {
            id: "lastCompleted" as const,
            label: "Last completed",
            icon: "clock-outline" as const,
          },
        ].map((option) => {
          const isSelected = sortOption === option.id;
          return (
            <Pressable
              key={option.id}
              onPress={() => setSortOption(option.id)}
              className={`active:opacity-80 flex-row items-center gap-3 p-3.5 rounded-lg ${isSelected ? "bg-primary" : "bg-surface-secondary"
                }`}

            >
              <MaterialCommunityIcons
                name={option.icon}
                size={20}
                color={isSelected ? rawColors.primaryForeground : rawColors.foregroundSecondary}
              />
              <Text
                className={`flex-1 text-base font-semibold ${isSelected ? "text-primary-foreground" : "text-foreground"
                  }`}
              >
                {option.label}
              </Text>
              {isSelected ? (
                <MaterialCommunityIcons name="check" size={18} color={rawColors.primaryForeground} />
              ) : null}
            </Pressable>
          );
        })}
      </View>

      <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
        {[
          { id: "ascending", label: sortOption === "alphabetical" ? "Ascending" : "Oldest" },
          { id: "descending", label: sortOption === "alphabetical" ? "Descending" : "Newest" },
        ].map((option) => {
          const isSelected =
            (option.id === "ascending" && sortAscending) ||
            (option.id === "descending" && !sortAscending);
          return (
            <Pressable
              key={option.id}
              onPress={() => setSortAscending(option.id === "ascending")}
              className={`active:opacity-80 flex-1 items-center justify-center p-3.5 rounded-lg ${isSelected ? "bg-primary" : "bg-surface-secondary"
                }`}

            >
              <Text
                className={`text-base font-semibold ${isSelected ? "text-primary-foreground" : "text-foreground-secondary"
                  }`}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View
        style={{
          marginTop: 18,
          borderRadius: 18,
          paddingHorizontal: 16,
          paddingVertical: 15,
          backgroundColor: rawColors.surfaceSecondary,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text
              style={{
                color: rawColors.foreground,
                fontSize: 15,
                fontWeight: "700",
              }}
            >
              All tab body-part groups
            </Text>
            <Text
              style={{
                marginTop: 4,
                color: rawColors.foregroundSecondary,
                fontSize: 13,
                lineHeight: 18,
              }}
            >
              Show or hide body-part section headings while viewing the `All` tab.
            </Text>
          </View>
          <Switch
            value={showAllTabBodyPartGrouping}
            onValueChange={handleShowAllTabBodyPartGroupingChange}
            trackColor={{
              false: rawColors.controlBorder,
              true: rawColors.primary,
            }}
            thumbColor={rawColors.primaryForeground}
            ios_backgroundColor={rawColors.controlBorder}
          />
        </View>
      </View>
    </AppModal>
  );
}
