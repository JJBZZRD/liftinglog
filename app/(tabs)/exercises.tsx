import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { Link } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { Animated, FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AddExerciseModal from "../../components/AddExerciseModal";
import BaseModal from "../../components/modals/BaseModal";
import { deleteExercise, lastPerformedAt, listExercises, updateExercise, type Exercise } from "../../lib/db/exercises";
import { useTheme } from "../../lib/theme/ThemeContext";

type SortOption = "alphabetical" | "lastCompleted";

export default function ExercisesScreen() {
  const { themeColors } = useTheme();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<Exercise[]>([]);
  const [fabActive, setFabActive] = useState(false);
  const [lastPerformedAtByExerciseId, setLastPerformedAtByExerciseId] = useState<Record<number, number | null>>({});
  const [isAddModalVisible, setAddModalVisible] = useState(false);
  const [isActionModalVisible, setActionModalVisible] = useState(false);
  const [isRenameModalVisible, setRenameModalVisible] = useState(false);
  const [isDeleteConfirmVisible, setDeleteConfirmVisible] = useState(false);
  const [selectedExercise, setSelectedExercise] = useState<Exercise | null>(null);
  const [renameText, setRenameText] = useState("");
  const scrollY = useRef(new Animated.Value(0)).current;
  
  // Filter and search state
  const [showFilterPopup, setShowFilterPopup] = useState(false);
  const [showSearchPopup, setShowSearchPopup] = useState(false);
  const [sortOption, setSortOption] = useState<SortOption>("alphabetical");
  const [sortAscending, setSortAscending] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  const HEADER_HEIGHT = 105 + insets.top;

  // Filter and sort the items
  const filteredAndSortedItems = useCallback(() => {
    let result = [...items];
    
    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      result = result.filter((item) => 
        item.name.toLowerCase().includes(query)
      );
    }
    
    // Apply sort
    if (sortOption === "alphabetical") {
      result.sort((a, b) => {
        const comparison = a.name.localeCompare(b.name);
        return sortAscending ? comparison : -comparison;
      });
    } else if (sortOption === "lastCompleted") {
      result.sort((a, b) => {
        const aTime = lastPerformedAtByExerciseId[a.id] ?? 0;
        const bTime = lastPerformedAtByExerciseId[b.id] ?? 0;
        return sortAscending ? aTime - bTime : bTime - aTime;
      });
    }
    
    return result;
  }, [items, searchQuery, sortOption, sortAscending, lastPerformedAtByExerciseId]);
  
  // Shadow opacity based on scroll position
  const headerShadowOpacity = scrollY.interpolate({
    inputRange: [0, 20],
    outputRange: [0, 0.15],
    extrapolate: "clamp",
  });

  const reloadExercises = useCallback(async () => {
    const rows = await listExercises();
    setItems(rows);
    const entries = await Promise.all(
      rows.map(async (exercise) => [exercise.id, await lastPerformedAt(exercise.id)] as const)
    );
    setLastPerformedAtByExerciseId(Object.fromEntries(entries));
  }, []);

  useFocusEffect(
    useCallback(() => {
      setFabActive(false);
      reloadExercises();
    }, [reloadExercises])
  );

  const handleRename = useCallback(async () => {
    const trimmed = renameText.trim();
    if (!selectedExercise || !trimmed) {
      setRenameModalVisible(false);
      return;
    }
    await updateExercise(selectedExercise.id, { name: trimmed });
    setRenameModalVisible(false);
    setSelectedExercise(null);
    await reloadExercises();
  }, [selectedExercise, renameText, reloadExercises]);

  const handleDelete = useCallback(async () => {
    if (!selectedExercise) {
      setDeleteConfirmVisible(false);
      return;
    }
    await deleteExercise(selectedExercise.id);
    setDeleteConfirmVisible(false);
    setSelectedExercise(null);
    await reloadExercises();
  }, [selectedExercise, reloadExercises]);

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      {/* Fixed Header */}
      <Animated.View 
        style={[
          styles.headerContainer, 
          { paddingTop: insets.top, backgroundColor: themeColors.background },
          {
            shadowColor: themeColors.shadow,
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: headerShadowOpacity,
            shadowRadius: 8,
            elevation: scrollY.interpolate({
              inputRange: [0, 20],
              outputRange: [0, 4],
              extrapolate: "clamp",
            }),
          }
        ]}
      >
        <View style={styles.headerContent}>
          <Text style={[styles.headerTitle, { color: themeColors.text }]}>Exercises</Text>
          <Text style={[styles.headerSubtitle, { color: themeColors.textSecondary }]}>Your exercise library</Text>
          <View style={styles.headerIcons}>
            <Pressable 
              style={styles.headerIconButton}
              onPress={() => setShowFilterPopup(true)}
            >
              <MaterialCommunityIcons 
                name="sort" 
                size={22} 
                color={(sortOption !== "alphabetical" || !sortAscending) ? themeColors.primary : themeColors.textSecondary} 
              />
            </Pressable>
            <Pressable 
              style={styles.headerIconButton}
              onPress={() => setShowSearchPopup(true)}
            >
              <MaterialCommunityIcons 
                name="magnify" 
                size={22} 
                color={searchQuery ? themeColors.primary : themeColors.textSecondary} 
              />
            </Pressable>
          </View>
        </View>
        <LinearGradient
          colors={[themeColors.background, "transparent"]}
          style={styles.headerFade}
        />
      </Animated.View>

      <FlatList
        data={filteredAndSortedItems()}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{ 
          padding: 16, 
          gap: 12,
          paddingTop: HEADER_HEIGHT + 45,
          paddingBottom: 100,
        }}
        bounces
        alwaysBounceVertical
        overScrollMode="always"
        decelerationRate="fast"
        scrollEventThrottle={16}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: false }
        )}
        renderItem={({ item }) => (
          <Link
            href={{ pathname: "/exercise/[id]", params: { id: String(item.id), name: item.name } }}
            asChild
          >
            <Pressable
              onLongPress={() => {
                setSelectedExercise(item);
                setRenameText(item.name);
                setActionModalVisible(true);
              }}
              style={{
                borderWidth: 1,
                borderRadius: 10,
                padding: 12,
                backgroundColor: themeColors.surface,
                borderColor: themeColors.border,
                shadowColor: themeColors.shadow,
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.1,
                shadowRadius: 8,
                elevation: 4,
              }}
            >
              <Text style={{ fontWeight: "600", marginBottom: 4, color: themeColors.text }}>{item.name}</Text>
              <Text style={{ fontSize: 12, color: themeColors.textSecondary }}>
                {lastPerformedAtByExerciseId[item.id]
                  ? new Date(lastPerformedAtByExerciseId[item.id] as number).toLocaleDateString()
                  : "Never"}
              </Text>
            </Pressable>
          </Link>
        )}
      />

      {/* FAB */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add exercise"
        onPressIn={() => setFabActive(true)}
        onPress={() => setAddModalVisible(true)}
        style={[styles.fab, { backgroundColor: themeColors.surface, borderColor: fabActive ? themeColors.textSecondary : themeColors.primary, shadowColor: themeColors.shadow }]}
      >
        <MaterialCommunityIcons 
          name="plus" 
          size={28} 
          color={fabActive ? themeColors.textSecondary : themeColors.primary} 
        />
      </Pressable>

      <AddExerciseModal
        visible={isAddModalVisible}
        onDismiss={() => {
          setAddModalVisible(false);
          setFabActive(false);
        }}
        onSaved={reloadExercises}
      />

      {/* Actions Modal */}
      <BaseModal
        visible={isActionModalVisible}
        onClose={() => setActionModalVisible(false)}
      >
        <Text style={[styles.modalTitle, { color: themeColors.text }]}>Exercise options</Text>
        <Pressable
          onPress={() => {
            setActionModalVisible(false);
            setRenameModalVisible(true);
          }}
          style={styles.modalOption}
        >
          <Text style={[styles.modalOptionText, { color: themeColors.primary }]}>Rename</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            setActionModalVisible(false);
            setDeleteConfirmVisible(true);
          }}
          style={styles.modalOption}
        >
          <Text style={[styles.modalOptionTextDestructive, { color: themeColors.destructive }]}>Delete</Text>
        </Pressable>
        <View style={styles.modalCancelRow}>
          <Pressable onPress={() => setActionModalVisible(false)} style={styles.modalCancelButton}>
            <Text style={[styles.modalCancelText, { color: themeColors.textSecondary }]}>Cancel</Text>
          </Pressable>
        </View>
      </BaseModal>

      {/* Rename Modal */}
      <BaseModal
        visible={isRenameModalVisible}
        onClose={() => setRenameModalVisible(false)}
        maxWidth={520}
      >
        <Text style={[styles.modalTitle, { color: themeColors.text }]}>Rename exercise</Text>
        <TextInput
          placeholder="New name"
          value={renameText}
          onChangeText={setRenameText}
          placeholderTextColor={themeColors.textPlaceholder}
          style={[styles.input, { borderColor: themeColors.border, color: themeColors.text, backgroundColor: themeColors.surfaceSecondary }]}
        />
        <View style={styles.modalButtonRow}>
          <Pressable onPress={() => setRenameModalVisible(false)} style={styles.modalCancelButton}>
            <Text style={[styles.modalCancelText, { color: themeColors.textSecondary }]}>Cancel</Text>
          </Pressable>
          <Pressable onPress={handleRename} style={[styles.modalPrimaryButton, { backgroundColor: themeColors.primary }]}>
            <Text style={[styles.modalPrimaryButtonText, { color: themeColors.surface }]}>Save</Text>
          </Pressable>
        </View>
      </BaseModal>

      {/* Delete Confirm Modal */}
      <BaseModal
        visible={isDeleteConfirmVisible}
        onClose={() => setDeleteConfirmVisible(false)}
      >
        <Text style={[styles.modalTitle, { color: themeColors.text }]}>Delete exercise?</Text>
        <Text style={[styles.modalMessage, { color: themeColors.textSecondary }]}>This action cannot be undone.</Text>
        <View style={styles.modalButtonRow}>
          <Pressable onPress={() => setDeleteConfirmVisible(false)} style={styles.modalCancelButton}>
            <Text style={[styles.modalCancelText, { color: themeColors.textSecondary }]}>Cancel</Text>
          </Pressable>
          <Pressable onPress={handleDelete} style={[styles.modalDestructiveButton, { backgroundColor: themeColors.destructive }]}>
            <Text style={[styles.modalDestructiveButtonText, { color: themeColors.surface }]}>Delete</Text>
          </Pressable>
        </View>
      </BaseModal>

      {/* Filter popup */}
      <Modal
        visible={showFilterPopup}
        transparent
        animationType="fade"
        onRequestClose={() => setShowFilterPopup(false)}
      >
        <Pressable
          style={styles.popupOverlay}
          onPress={() => setShowFilterPopup(false)}
        >
          <View style={[styles.popupContainerLeft, { top: insets.top + 125 }]}>
            <View style={[styles.popupArrowLeft, { borderBottomColor: themeColors.surface }]} />
            <Pressable style={[styles.popup, { backgroundColor: themeColors.surface, shadowColor: themeColors.shadow }]} onPress={() => {}}>
              <Text style={[styles.popupTitle, { color: themeColors.textTertiary }]}>Sort by</Text>
              <Pressable
                style={styles.popupOption}
                onPress={() => setSortOption("alphabetical")}
              >
                <MaterialCommunityIcons 
                  name="sort-alphabetical-ascending" 
                  size={20} 
                  color={sortOption === "alphabetical" ? themeColors.primary : themeColors.textSecondary} 
                />
                <Text style={[
                  styles.popupOptionText,
                  { color: themeColors.text },
                  sortOption === "alphabetical" && { color: themeColors.primary, fontWeight: "600" }
                ]}>
                  Alphabetically
                </Text>
                {sortOption === "alphabetical" && (
                  <MaterialCommunityIcons name="check" size={18} color={themeColors.primary} />
                )}
              </Pressable>
              <Pressable
                style={styles.popupOption}
                onPress={() => setSortOption("lastCompleted")}
              >
                <MaterialCommunityIcons 
                  name="clock-outline" 
                  size={20} 
                  color={sortOption === "lastCompleted" ? themeColors.primary : themeColors.textSecondary} 
                />
                <Text style={[
                  styles.popupOptionText,
                  { color: themeColors.text },
                  sortOption === "lastCompleted" && { color: themeColors.primary, fontWeight: "600" }
                ]}>
                  Last completed
                </Text>
                {sortOption === "lastCompleted" && (
                  <MaterialCommunityIcons name="check" size={18} color={themeColors.primary} />
                )}
              </Pressable>
              
              <View style={[styles.popupDivider, { backgroundColor: themeColors.borderLight }]} />
              
              <Text style={[styles.popupTitle, { color: themeColors.textTertiary }]}>Order</Text>
              <Pressable
                style={styles.popupOption}
                onPress={() => setSortAscending(true)}
              >
                <MaterialCommunityIcons 
                  name="arrow-up" 
                  size={20} 
                  color={sortAscending ? themeColors.primary : themeColors.textSecondary} 
                />
                <Text style={[
                  styles.popupOptionText,
                  { color: themeColors.text },
                  sortAscending && { color: themeColors.primary, fontWeight: "600" }
                ]}>
                  Ascending
                </Text>
                {sortAscending && (
                  <MaterialCommunityIcons name="check" size={18} color={themeColors.primary} />
                )}
              </Pressable>
              <Pressable
                style={styles.popupOption}
                onPress={() => setSortAscending(false)}
              >
                <MaterialCommunityIcons 
                  name="arrow-down" 
                  size={20} 
                  color={!sortAscending ? themeColors.primary : themeColors.textSecondary} 
                />
                <Text style={[
                  styles.popupOptionText,
                  { color: themeColors.text },
                  !sortAscending && { color: themeColors.primary, fontWeight: "600" }
                ]}>
                  Descending
                </Text>
                {!sortAscending && (
                  <MaterialCommunityIcons name="check" size={18} color={themeColors.primary} />
                )}
              </Pressable>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      {/* Search popup */}
      <Modal
        visible={showSearchPopup}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSearchPopup(false)}
      >
        <Pressable
          style={styles.popupOverlay}
          onPress={() => setShowSearchPopup(false)}
        >
          <View style={[styles.popupContainerLeft, { top: insets.top + 125, left: 64 }]}>
            <View style={[styles.popupArrowLeft, { borderBottomColor: themeColors.surface }]} />
            <Pressable style={[styles.popup, { backgroundColor: themeColors.surface, shadowColor: themeColors.shadow }]} onPress={() => {}}>
              <View style={styles.searchInputContainer}>
                <MaterialCommunityIcons name="magnify" size={20} color={themeColors.textTertiary} />
                <TextInput
                  style={[styles.searchInput, { color: themeColors.text }]}
                  placeholder="Search exercises..."
                  placeholderTextColor={themeColors.textPlaceholder}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  autoFocus
                />
                {searchQuery.length > 0 && (
                  <Pressable onPress={() => setSearchQuery("")}>
                    <MaterialCommunityIcons name="close-circle" size={18} color={themeColors.textTertiary} />
                  </Pressable>
                )}
              </View>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  headerContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 4,
  },
  headerIcons: {
    flexDirection: "row",
    gap: 8,
    marginTop: 8,
  },
  headerIconButton: {
    padding: 8,
    borderRadius: 8,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: "700",
  },
  headerSubtitle: {
    fontSize: 16,
    marginTop: 4,
  },
  headerFade: {
    height: 8,
  },
  exerciseCard: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
  },
  exerciseName: {
    fontWeight: "600",
    marginBottom: 4,
  },
  exerciseDate: {
    fontSize: 12,
  },
  fab: {
    position: "absolute",
    right: 20,
    bottom: 94,
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 8,
  },
  // Modal styles
  modalTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 12,
  },
  modalMessage: {
    marginBottom: 12,
  },
  modalOption: {
    paddingVertical: 10,
  },
  modalOptionText: {
    fontWeight: "600",
  },
  modalOptionTextDestructive: {
    fontWeight: "600",
  },
  modalCancelRow: {
    alignItems: "flex-end",
  },
  modalCancelButton: {
    padding: 10,
  },
  modalCancelText: {},
  modalButtonRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
    marginTop: 4,
  },
  modalPrimaryButton: {
    padding: 10,
    borderRadius: 8,
  },
  modalPrimaryButtonText: {
    fontWeight: "600",
  },
  modalDestructiveButton: {
    padding: 10,
    borderRadius: 8,
  },
  modalDestructiveButtonText: {
    fontWeight: "600",
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  // Popup styles (kept as-is for custom positioning)
  popupOverlay: {
    flex: 1,
    backgroundColor: "transparent",
  },
  popupContainerLeft: {
    position: "absolute",
    left: 16,
    alignItems: "flex-start",
  },
  popupArrowLeft: {
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderBottomWidth: 8,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    marginLeft: 12,
    shadowOffset: { width: 0, height: -1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  popup: {
    borderRadius: 12,
    paddingVertical: 8,
    minWidth: 200,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  popupTitle: {
    fontSize: 13,
    fontWeight: "600",
    paddingHorizontal: 16,
    paddingVertical: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  popupDivider: {
    height: 1,
    marginVertical: 8,
  },
  popupOption: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  popupOptionText: {
    flex: 1,
    fontSize: 16,
  },
  popupOptionTextActive: {
    fontWeight: "600",
  },
  searchInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 4,
  },
});
