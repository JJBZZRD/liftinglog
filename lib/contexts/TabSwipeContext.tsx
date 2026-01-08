import { createContext } from "react";

export interface TabSwipeContextType {
  setSwipeEnabled: (enabled: boolean) => void;
}

export const TabSwipeContext = createContext<TabSwipeContextType>({
  setSwipeEnabled: () => {},
});
