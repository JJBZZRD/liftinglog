import type { ComponentType } from "react";
import { Text } from "react-native";

export const restrictedProgramRoutes = [
  "programs/manage",
  "programs/create/basics",
  "programs/create/editor",
  "programs/create/schedule",
  "programs/create/exercise-picker",
  "programs/templates",
  "programs/template-import",
  "programs/template-exercise-picker",
  "programs/exercise-log/[id]",
] as const;

export const restrictedHealthRoutes = [
  "user-metrics",
  "user-metric/[metric]",
  "performance-guide",
] as const;

export const restrictedRecordingRoutes = ["exercise/record-video"] as const;

type RouteModule = { default: ComponentType };
type MountedRoutes = Record<string, number>;

function routeModule(route: string, mountedRoutes: MountedRoutes): RouteModule {
  return {
    default: () => {
      mountedRoutes[route] = (mountedRoutes[route] ?? 0) + 1;
      return <Text testID={`route-${route}`}>{route}</Text>;
    },
  };
}

export function createProfileRouteHarness(RootLayout: ComponentType) {
  const mountedRoutes: MountedRoutes = {};
  const context: Record<string, RouteModule> = {
    "_layout": { default: RootLayout },
    "(tabs)/index": routeModule("home", mountedRoutes),
    "(tabs)/exercises": routeModule("exercises-tab", mountedRoutes),
    "(tabs)/programs": routeModule("programs-tab", mountedRoutes),
    "(tabs)/settings": routeModule("settings-tab", mountedRoutes),
    "exercise/[id]": routeModule("manual-exercise", mountedRoutes),
    "set/[id]": routeModule("gallery", mountedRoutes),
    "add-exercise": routeModule("add-exercise", mountedRoutes),
    "edit-workout": routeModule("edit-workout", mountedRoutes),
    "workout-history": routeModule("workout-history", mountedRoutes),
    "calculators/index": routeModule("calculators", mountedRoutes),
  };

  for (const route of restrictedProgramRoutes) {
    context[route] = routeModule(route, mountedRoutes);
  }
  for (const route of restrictedHealthRoutes) {
    context[route] = routeModule(route, mountedRoutes);
  }
  for (const route of restrictedRecordingRoutes) {
    context[route] = routeModule(route, mountedRoutes);
  }

  return { context, mountedRoutes };
}
