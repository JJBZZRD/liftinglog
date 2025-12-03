import { Picker } from "@react-native-picker/picker";
import { useEffect, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { getGlobalFormula, setGlobalFormula, type E1RMFormulaId } from "../../lib/db/index";
import { SafeAreaView } from "react-native-safe-area-context";

export default function SettingsScreen() {
  const [selected, setSelected] = useState<E1RMFormulaId>("epley");

  useEffect(() => {
    const current = getGlobalFormula();
    setSelected(current);
  }, []);

  const options = useMemo(
    () => [
      { id: "epley", label: "Epley" },
      { id: "brzycki", label: "Brzycki" },
      { id: "oconner", label: "O’Conner" },
      { id: "lombardi", label: "Lombardi" },
      { id: "mayhew", label: "Mayhew" },
      { id: "wathan", label: "Wathan" },
    ] as { id: E1RMFormulaId; label: string }[],
    []
  );

  function onSelect(id: E1RMFormulaId) {
    setSelected(id);
    setGlobalFormula(id);
  }

  return (
    <SafeAreaView
      style={{
        flex: 1,
        justifyContent: "flex-start",
        alignItems: "stretch",
        padding: 16,
        gap: 16,
      }}
    >
      <Text style={{ fontSize: 20, fontWeight: "600" }}>Settings</Text>
      <Text style={{ marginTop: 8, marginBottom: 4 }}>Estimated 1RM Formula</Text>
      <View
        style={{
          borderWidth: 1,
          borderColor: "#ccc",
          borderRadius: 8,
          overflow: "hidden",
          backgroundColor: "#fff",
        }}
      >
        <Picker
          selectedValue={selected}
          onValueChange={(value) => onSelect(value as E1RMFormulaId)}
        >
          {options.map((opt) => (
            <Picker.Item key={opt.id} label={opt.label} value={opt.id} />
          ))}
        </Picker>
      </View>
    </SafeAreaView>
  );
}



