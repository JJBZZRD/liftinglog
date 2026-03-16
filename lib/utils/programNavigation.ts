import { router, type Href } from "expo-router";

export function returnToManagePrograms(params?: { activateProgramId?: string }) {
  const href: Href = params?.activateProgramId
    ? {
        pathname: "/programs/manage",
        params: { activateProgramId: params.activateProgramId },
      }
    : "/programs/manage";

  if (router.canDismiss()) {
    router.dismissTo(href);
    return;
  }

  router.replace(href);
}

export function returnToProgramsTab() {
  const href: Href = "/(tabs)/programs";

  if (router.canDismiss()) {
    router.dismissTo(href);
    return;
  }

  router.replace(href);
}
