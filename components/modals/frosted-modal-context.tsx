import { createContext, useContext, type ReactNode, type RefObject } from 'react';
import type { View } from 'react-native';

export type ModalBlurTarget = RefObject<View | null>;
const FrostedModalContext = createContext<ModalBlurTarget | null>(null);

/** Opt a page's BaseModal descendants into frosted presentation. */
export function FrostedModalProvider({ blurTarget, children }: {
  blurTarget: ModalBlurTarget; children: ReactNode;
}) {
  return <FrostedModalContext.Provider value={blurTarget}>{children}</FrostedModalContext.Provider>;
}

export function useFrostedModalTarget() {
  return useContext(FrostedModalContext);
}
