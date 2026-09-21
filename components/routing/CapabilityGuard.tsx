import { Redirect } from "expo-router";
import type { ReactNode } from "react";

import { type AppCapabilities } from "../../lib/config/releaseProfile";
import { isCapabilityEnabled } from "../../lib/routing/capabilityAccess";

type CapabilityGuardProps = {
  capability: keyof AppCapabilities;
  children: ReactNode;
};

export function CapabilityGuard({ capability, children }: CapabilityGuardProps) {
  if (!isCapabilityEnabled(capability)) {
    return <Redirect href="/(tabs)" />;
  }

  return <>{children}</>;
}
