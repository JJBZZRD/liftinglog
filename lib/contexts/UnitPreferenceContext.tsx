import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react";
import type { UnitPreference } from "../db/connection";
import {
  getUnitPreference as getUnitPreferenceDB,
  setUnitPreference as setUnitPreferenceDB,
} from "../db/settings";

type UnitPreferenceContextType = {
  unitPreference: UnitPreference;
  setUnitPreference: (unit: UnitPreference) => void;
};

const UnitPreferenceContext = createContext<UnitPreferenceContextType | undefined>(undefined);

export function UnitPreferenceProvider({ children }: { children: ReactNode }) {
  const [unitPreference, setUnitPreferenceState] = useState<UnitPreference>("kg");
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    try {
      setUnitPreferenceState(getUnitPreferenceDB());
    } catch (error) {
      console.error("Error loading unit preference:", error);
      setUnitPreferenceState("kg");
    } finally {
      setIsInitialized(true);
    }
  }, []);

  const updateUnitPreference = (unit: UnitPreference) => {
    setUnitPreferenceState(unit);
    try {
      setUnitPreferenceDB(unit);
    } catch (error) {
      console.error("Error saving unit preference:", error);
    }
  };

  const value = useMemo<UnitPreferenceContextType>(
    () => ({
      unitPreference,
      setUnitPreference: updateUnitPreference,
    }),
    [unitPreference]
  );

  if (!isInitialized) {
    return null;
  }

  return <UnitPreferenceContext.Provider value={value}>{children}</UnitPreferenceContext.Provider>;
}

export function useUnitPreference() {
  const context = useContext(UnitPreferenceContext);
  if (context === undefined) {
    throw new Error("useUnitPreference must be used within a UnitPreferenceProvider");
  }
  return context;
}
