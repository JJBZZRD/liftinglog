import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { router, Stack } from "expo-router";
import { useCallback, useState } from "react";
import {
  FlatList,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  View,
} from "react-native";
import BaseModal from "../../components/modals/BaseModal";
import { useTheme } from "../../lib/theme/ThemeContext";
import {
  listPslPrograms,
  activatePslProgram,
  deactivatePslProgram,
  deletePslProgram,
  type PslProgramRow,
} from "../../lib/db/pslPrograms";
import {
  deleteCalendarForProgram,
  insertCalendarEntries,
} from "../../lib/db/programCalendar";
import {
  compilePslSource,
  extractCalendarEntries,
} from "../../lib/programs/psl/pslService";

export default function ManageProgramsScreen() {
  const { rawColors } = useTheme();
  const [programs, setPrograms] = useState<PslProgramRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [actionProgram, setActionProgram] = useState<PslProgramRow | null>(null);
  const [actionModalVisible, setActionModalVisible] = useState(false);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const all = await listPslPrograms();
      setPrograms(all);
    } catch (error) {
      console.error("Error loading programs:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const activePrograms = programs.filter((p) => p.isActive);
  const inactivePrograms = programs.filter((p) => !p.isActive);

  const sections = [
    { title: "Active Programs", data: activePrograms },
    { title: "All Programs", data: inactivePrograms },
  ];

  const handleToggleActive = useCallback(
    async (program: PslProgramRow) => {
      setActionModalVisible(false);
      setActionProgram(null);

      if (program.isActive) {
        await deactivatePslProgram(program.id);
        await deleteCalendarForProgram(program.id);
      } else {
        await activatePslProgram(program.id);
        // Re-materialize calendar
        const result = compilePslSource(program.pslSource);
        if (result.valid && result.materialized) {
          const entries = extractCalendarEntries(result.materialized);
          await deleteCalendarForProgram(program.id);
          await insertCalendarEntries(program.id, entries);
        }
      }
      await loadData();
    },
    [loadData]
  );

  const handleDelete = useCallback(async () => {
    if (!actionProgram) return;
    setDeleteModalVisible(false);
    setActionModalVisible(false);
    await deletePslProgram(actionProgram.id);
    setActionProgram(null);
    await loadData();
  }, [actionProgram, loadData]);

  const handleProgramPress = useCallback((program: PslProgramRow) => {
    setActionProgram(program);
    setActionModalVisible(true);
  }, []);

  const renderProgramItem = useCallback(
    ({ item }: { item: PslProgramRow }) => (
      <Pressable
        onPress={() => handleProgramPress(item)}
        style={({ pressed }) => [
          styles.programItem,
          {
            backgroundColor: pressed ? rawColors.pressed : rawColors.surface,
            borderColor: rawColors.borderLight,
          },
        ]}
      >
        <View style={styles.programInfo}>
          <Text
            style={[styles.programName, { color: rawColors.foreground }]}
            numberOfLines={1}
          >
            {item.name}
          </Text>
          {item.description ? (
            <Text
              style={[styles.programDesc, { color: rawColors.foregroundSecondary }]}
              numberOfLines={1}
            >
              {item.description}
            </Text>
          ) : null}
        </View>
        <View style={styles.programBadges}>
          {item.isActive && (
            <View style={[styles.activeBadge, { backgroundColor: rawColors.success + "20" }]}>
              <View style={[styles.activeDot, { backgroundColor: rawColors.success }]} />
              <Text style={[styles.activeBadgeText, { color: rawColors.success }]}>Active</Text>
            </View>
          )}
          <MaterialCommunityIcons name="dots-vertical" size={20} color={rawColors.foregroundSecondary} />
        </View>
      </Pressable>
    ),
    [rawColors, handleProgramPress]
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: { title: string; data: PslProgramRow[] } }) => (
      <View style={[styles.sectionHeader, { backgroundColor: rawColors.background }]}>
        <Text style={[styles.sectionTitle, { color: rawColors.foregroundSecondary }]}>
          {section.title}
        </Text>
        <Text style={[styles.sectionCount, { color: rawColors.foregroundMuted }]}>
          {section.data.length}
        </Text>
      </View>
    ),
    [rawColors]
  );

  const renderEmptySection = useCallback(
    ({ section }: { section: { title: string } }) => {
      if (section.title === "Active Programs") {
        return (
          <View style={styles.emptySection}>
            <Text style={[styles.emptySectionText, { color: rawColors.foregroundMuted }]}>
              No active programs. Long press a program to activate it.
            </Text>
          </View>
        );
      }
      return null;
    },
    [rawColors]
  );

  return (
    <View style={styles.container} className="bg-background">
      <Stack.Screen
        options={{
          title: "Manage Programs",
          headerStyle: { backgroundColor: rawColors.background },
          headerTintColor: rawColors.foreground,
          headerRight: () => (
            <Pressable onPress={() => setAddModalVisible(true)} hitSlop={8}>
              <MaterialCommunityIcons name="plus" size={26} color={rawColors.primary} />
            </Pressable>
          ),
        }}
      />

      {programs.length === 0 && !loading ? (
        <View style={styles.emptyState}>
          <MaterialCommunityIcons name="book-outline" size={64} color={rawColors.foregroundMuted} />
          <Text style={[styles.emptyTitle, { color: rawColors.foregroundMuted }]}>
            No programs yet
          </Text>
          <Text style={[styles.emptySubtitle, { color: rawColors.foregroundMuted }]}>
            Create a custom program or import a template to get started.
          </Text>
          <Pressable
            onPress={() => setAddModalVisible(true)}
            style={[styles.emptyButton, { backgroundColor: rawColors.primary }]}
          >
            <MaterialCommunityIcons name="plus" size={20} color={rawColors.primaryForeground} />
            <Text style={[styles.emptyButtonText, { color: rawColors.primaryForeground }]}>
              Add Program
            </Text>
          </Pressable>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderProgramItem}
          renderSectionHeader={renderSectionHeader}
          renderSectionFooter={renderEmptySection}
          contentContainerStyle={styles.listContent}
          stickySectionHeadersEnabled={false}
        />
      )}

      {/* Add Program Modal */}
      <BaseModal visible={addModalVisible} onClose={() => setAddModalVisible(false)}>
        <Text style={[styles.modalTitle, { color: rawColors.foreground }]}>
          Add Program
        </Text>
        <Pressable
          onPress={() => {
            setAddModalVisible(false);
            router.push("/programs/create/basics");
          }}
          style={[styles.addOption, { backgroundColor: rawColors.surfaceSecondary }]}
        >
          <MaterialCommunityIcons name="pencil-plus-outline" size={24} color={rawColors.primary} />
          <View style={styles.addOptionText}>
            <Text style={[styles.addOptionTitle, { color: rawColors.foreground }]}>
              Create Program
            </Text>
            <Text style={[styles.addOptionDesc, { color: rawColors.foregroundSecondary }]}>
              Build a custom program from scratch
            </Text>
          </View>
        </Pressable>
        <Pressable
          onPress={() => {
            setAddModalVisible(false);
            router.push("/programs/templates");
          }}
          style={[styles.addOption, { backgroundColor: rawColors.surfaceSecondary }]}
        >
          <MaterialCommunityIcons name="book-open-variant" size={24} color={rawColors.primary} />
          <View style={styles.addOptionText}>
            <Text style={[styles.addOptionTitle, { color: rawColors.foreground }]}>
              Use Template
            </Text>
            <Text style={[styles.addOptionDesc, { color: rawColors.foregroundSecondary }]}>
              Choose from popular training programs
            </Text>
          </View>
        </Pressable>
      </BaseModal>

      {/* Program Action Modal */}
      <BaseModal visible={actionModalVisible} onClose={() => { setActionModalVisible(false); setActionProgram(null); }}>
        {actionProgram && (
          <>
            <Text style={[styles.modalTitle, { color: rawColors.foreground }]}>
              {actionProgram.name}
            </Text>
            <Pressable
              onPress={() => handleToggleActive(actionProgram)}
              style={[styles.actionOption, { backgroundColor: rawColors.surfaceSecondary }]}
            >
              <MaterialCommunityIcons
                name={actionProgram.isActive ? "pause-circle-outline" : "play-circle-outline"}
                size={22}
                color={rawColors.primary}
              />
              <Text style={[styles.actionOptionText, { color: rawColors.foreground }]}>
                {actionProgram.isActive ? "Deactivate" : "Activate"}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setActionModalVisible(false);
                setDeleteModalVisible(true);
              }}
              style={[styles.actionOption, { backgroundColor: rawColors.surfaceSecondary }]}
            >
              <MaterialCommunityIcons name="delete-outline" size={22} color={rawColors.destructive} />
              <Text style={[styles.actionOptionText, { color: rawColors.destructive }]}>
                Delete Program
              </Text>
            </Pressable>
          </>
        )}
      </BaseModal>

      {/* Delete Confirmation */}
      <BaseModal visible={deleteModalVisible} onClose={() => { setDeleteModalVisible(false); setActionProgram(null); }}>
        <Text style={[styles.modalTitle, { color: rawColors.foreground }]}>
          Delete Program?
        </Text>
        <Text style={[styles.modalBody, { color: rawColors.foregroundSecondary }]}>
          This will permanently delete "{actionProgram?.name}" and all its scheduled sessions. This cannot be undone.
        </Text>
        <View style={styles.modalButtons}>
          <Pressable
            onPress={() => { setDeleteModalVisible(false); setActionProgram(null); }}
            style={[styles.modalButton, { backgroundColor: rawColors.surfaceSecondary }]}
          >
            <Text style={[styles.modalButtonText, { color: rawColors.foreground }]}>Cancel</Text>
          </Pressable>
          <Pressable
            onPress={handleDelete}
            style={[styles.modalButton, { backgroundColor: rawColors.destructive }]}
          >
            <Text style={[styles.modalButtonText, { color: "#FFFFFF" }]}>Delete</Text>
          </Pressable>
        </View>
      </BaseModal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingTop: 20,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  sectionCount: {
    fontSize: 13,
    fontWeight: "600",
  },
  programItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 8,
  },
  programInfo: {
    flex: 1,
    marginRight: 8,
  },
  programName: {
    fontSize: 15,
    fontWeight: "600",
  },
  programDesc: {
    fontSize: 13,
    marginTop: 2,
  },
  programBadges: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  activeBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    gap: 4,
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  activeBadgeText: {
    fontSize: 11,
    fontWeight: "700",
  },
  emptySection: {
    paddingVertical: 16,
    paddingHorizontal: 8,
  },
  emptySectionText: {
    fontSize: 13,
    fontStyle: "italic",
    textAlign: "center",
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: "center",
    marginTop: 8,
    lineHeight: 20,
  },
  emptyButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 14,
    marginTop: 24,
    gap: 8,
  },
  emptyButtonText: {
    fontSize: 15,
    fontWeight: "600",
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 16,
  },
  modalBody: {
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 24,
  },
  addOption: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 14,
    marginBottom: 10,
    gap: 14,
  },
  addOptionText: {
    flex: 1,
  },
  addOptionTitle: {
    fontSize: 15,
    fontWeight: "600",
  },
  addOptionDesc: {
    fontSize: 13,
    marginTop: 2,
  },
  actionOption: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 12,
    marginBottom: 8,
    gap: 12,
  },
  actionOptionText: {
    fontSize: 15,
    fontWeight: "500",
  },
  modalButtons: {
    flexDirection: "row",
    gap: 12,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  modalButtonText: {
    fontSize: 15,
    fontWeight: "600",
  },
});
