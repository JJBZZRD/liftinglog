import type { Media } from "../../lib/db/media";

export function mediaFixture(overrides: Partial<Media> = {}): Media {
  return {
    id: 1,
    localUri: "file:///app/documents/set-videos/old.mp4",
    assetId: "asset-old",
    mime: "video/mp4",
    setId: 42,
    workoutId: null,
    note: null,
    createdAt: 100,
    originalFilename: "old.mp4",
    mediaCreatedAt: 1_700_000_000_000,
    durationMs: 10_000,
    albumName: "LiftingLog",
    ...overrides,
  };
}

export function pressableText(node: unknown, text: string): unknown {
  if (!node || typeof node !== "object") return null;
  const candidate = node as { props?: { children?: unknown; onPress?: unknown } };
  const children = candidate.props?.children ?? (candidate as { children?: unknown }).children;
  if (children === text) return node;
  for (const child of Array.isArray(children) ? children : [children]) {
    const found = pressableText(child, text);
    if (found) return candidate.props?.onPress ? node : found;
  }
  return null;
}
