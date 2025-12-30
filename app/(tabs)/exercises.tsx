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
import { colors } from "../../lib/theme/colors";

type SortOption = "alphabetical" | "lastCompleted";

export default function ExercisesScreen() {
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
    <View style={styles.container}>
      {/* Fixed Header */}
      <Animated.View 
        style={[
          styles.headerContainer, 
          { paddingTop: insets.top },
          {
            shadowColor: colors.shadow,
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
          <Text style={styles.headerTitle}>Exercises</Text>
          <Text style={styles.headerSubtitle}>Your exercise library</Text>
          <View style={styles.headerIcons}>
            <Pressable 
              style={styles.headerIconButton}
              onPress={() => setShowFilterPopup(true)}
            >
              <MaterialCommunityIcons 
                name="sort" 
                size={22} 
                color={(sortOption !== "alphabetical" || !sortAscending) ? colors.primary : colors.textSecondary} 
              />
            </Pressable>
            <Pressable 
              style={styles.headerIconButton}
              onPress={() => setShowSearchPopup(true)}
            >
              <MaterialCommunityIcons 
                name="magnify" 
                size={22} 
                color={searchQuery ? colors.primary : colors.textSecondary} 
              />
            </Pressable>
          </View>
        </View>
        <LinearGradient
          colors={[colors.background, "rgba(245, 245, 245, 0)"]}
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
              style={styles.exerciseCard}
            >
              <Text style={styles.exerciseName}>{item.name}</Text>
              <Text style={styles.exerciseDate}>
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
        style={[styles.fab, { borderColor: fabActive ? colors.textSecondary : colors.primary }]}
      >
        <MaterialCommunityIcons 
          name="plus" 
          size={28} 
          color={fabActive ? colors.textSecondary : colors.primary} 
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
        <Text style={styles.modalTitle}>Exercise options</Text>
        <Pressable
          onPress={() => {
            setActionModalVisible(false);
            setRenameModalVisible(true);
          }}
          style={styles.modalOption}
        >
          <Text style={styles.modalOptionText}>Rename</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            setActionModalVisible(false);
            setDeleteConfirmVisible(true);
          }}
          style={styles.modalOption}
        >
          <Text style={styles.modalOptionTextDestructive}>Delete</Text>
        </Pressable>
        <View style={styles.modalCancelRow}>
          <Pressable onPress={() => setActionModalVisible(false)} style={styles.modalCancelButton}>
            <Text style={styles.modalCancelText}>Cancel</Text>
          </Pressable>
        </View>
      </BaseModal>

      {/* Rename Modal */}
      <BaseModal
        visible={isRenameModalVisible}
        onClose={() => setRenameModalVisible(false)}
        maxWidth={520}
      >
        <Text style={styles.modalTitle}>Rename exercise</Text>
        <TextInput
          placeholder="New name"
          value={renameText}
          onChangeText={setRenameText}
          style={styles.input}
        />
        <View style={styles.modalButtonRow}>
          <Pressable onPress={() => setRenameModalVisible(false)} style={styles.modalCancelButton}>
            <Text style={styles.modalCancelText}>Cancel</Text>
          </Pressable>
          <Pressable onPress={handleRename} style={styles.modalPrimaryButton}>
            <Text style={styles.modalPrimaryButtonText}>Save</Text>
          </Pressable>
        </View>
      </BaseModal>

      {/* Delete Confirm Modal */}
      <BaseModal
        visible={isDeleteConfirmVisible}
        onClose={() => setDeleteConfirmVisible(false)}
      >
        <Text style={styles.modalTitle}>Delete exercise?</Text>
        <Text style={styles.modalMessage}>This action cannot be undone.</Text>
        <View style={styles.modalButtonRow}>
          <Pressable onPress={() => setDeleteConfirmVisible(false)} style={styles.modalCancelButton}>
            <Text style={styles.modalCancelText}>Cancel</Text>
          </Pressable>
          <Pressable onPress={handleDelete} style={styles.modalDestructiveButton}>
            <Text style={styles.modalDestructiveButtonText}>Delete</Text>
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
            <View style={styles.popupArrowLeft} />
            <Pressable style={styles.popup} onPress={() => {}}>
              <Text style={styles.popupTitle}>Sort by</Text>
              <Pressable
                style={styles.popupOption}
                onPress={() => setSortOption("alphabetical")}
              >
                <MaterialCommunityIcons 
                  name="sort-alphabetical-ascending" 
                  size={20} 
                  color={sortOption === "alphabetical" ? colors.primary : colors.textSecondary} 
                />
                <Text style={[
                  styles.popupOptionText,
                  sortOption === "alphabetical" && styles.popupOptionTextActive
                ]}>
                  Alphabetically
                </Text>
                {sortOption === "alphabetical" && (
                  <MaterialCommunityIcons name="check" size={18} color={colors.primary} />
                )}
              </Pressable>
              <Pressable
                style={styles.popupOption}
                onPress={() => setSortOption("lastCompleted")}
              >
                <MaterialCommunityIcons 
                  name="clock-outline" 
                  size={20} 
                  color={sortOption === "lastCompleted" ? colors.primary : colors.textSecondary} 
                />
                <Text style={[
                  styles.popupOptionText,
                  sortOption === "lastCompleted" && styles.popupOptionTextActive
                ]}>
                  Last completed
                </Text>
                {sortOption === "lastCompleted" && (
                  <MaterialCommunityIcons name="check" size={18} color={colors.primary} />
                )}
              </Pressable>
              
              <View style={styles.popupDivider} />
              
              <Text style={styles.popupTitle}>Order</Text>
              <Pressable
                style={styles.popupOption}
                onPress={() => setSortAscending(true)}
              >
                <MaterialCommunityIcons 
                  name="arrow-up" 
                  size={20} 
                  color={sortAscending ? colors.primary : colors.textSecondary} 
                />
                <Text style={[
                  styles.popupOptionText,
                  sortAscending && styles.popupOptionTextActive
                ]}>
                  Ascending
                </Text>
                {sortAscending && (
                  <MaterialCommunityIcons name="check" size={18} color={colors.primary} />
                )}
              </Pressable>
              <Pressable
                style={styles.popupOption}
                onPress={() => setSortAscending(false)}
              >
                <MaterialCommunityIcons 
                  name="arrow-down" 
                  size={20} 
                  color={!sortAscending ? colors.primary : colors.textSecondary} 
                />
                <Text style={[
                  styles.popupOptionText,
                  !sortAscending && styles.popupOptionTextActive
                ]}>
                  Descending
                </Text>
                {!sortAscending && (
                  <MaterialCommunityIcons name="check" size={18} color={colors.primary} />
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
            <View style={styles.popupArrowLeft} />
            <Pressable style={styles.popup} onPress={() => {}}>
              <View style={styles.searchInputContainer}>
                <MaterialCommunityIcons name="magnify" size={20} color={colors.textTertiary} />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search exercises..."
                  placeholderTextColor={colors.textTertiary}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  autoFocus
                />
                {searchQuery.length > 0 && (
                  <Pressable onPress={() => setSearchQuery("")}>
                    <MaterialCommunityIcons name="close-circle" size={18} color={colors.textTertiary} />
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
    backgroundColor: colors.background,
  },
  headerContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    backgroundColor: colors.background,
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
    color: colors.text,
  },
  headerSubtitle: {
    fontSize: 16,
    color: colors.textSecondary,
    marginTop: 4,
  },
  headerFade: {
    height: 8,
  },
  exerciseCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 12,
    backgroundColor: colors.surface,
  },
  exerciseName: {
    fontWeight: "600",
    marginBottom: 4,
    color: colors.text,
  },
  exerciseDate: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  fab: {
    position: "absolute",
    right: 20,
    bottom: 94,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.surface,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: colors.shadow,
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
    color: colors.text,
  },
  modalMessage: {
    color: colors.textSecondary,
    marginBottom: 12,
  },
  modalOption: {
    paddingVertical: 10,
  },
  modalOptionText: {
    color: colors.primary,
    fontWeight: "600",
  },
  modalOptionTextDestructive: {
    color: colors.destructive,
    fontWeight: "600",
  },
  modalCancelRow: {
    alignItems: "flex-end",
  },
  modalCancelButton: {
    padding: 10,
  },
  modalCancelText: {
    color: colors.textSecondary,
  },
  modalButtonRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
    marginTop: 4,
  },
  modalPrimaryButton: {
    backgroundColor: colors.primary,
    padding: 10,
    borderRadius: 8,
  },
  modalPrimaryButtonText: {
    color: colors.surface,
    fontWeight: "600",
  },
  modalDestructiveButton: {
    backgroundColor: colors.destructive,
    padding: 10,
    borderRadius: 8,
  },
  modalDestructiveButtonText: {
    color: colors.surface,
    fontWeight: "600",
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
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
    borderBottomColor: colors.surface,
    marginLeft: 12,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: -1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  popup: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingVertical: 8,
    minWidth: 200,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  popupTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.textTertiary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  popupDivider: {
    height: 1,
    backgroundColor: colors.borderLight,
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
    color: colors.text,
  },
  popupOptionTextActive: {
    color: colors.primary,
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
    color: colors.text,
    paddingVertical: 4,
  },
});
