import { useEffect, useState } from "react";
import type { LatestUserMetric } from "../db/userCheckins";
import { getLatestUserMetricsSnapshot } from "../db/userCheckins";

export function useLatestBodyweight() {
  const [latestBodyweight, setLatestBodyweight] = useState<LatestUserMetric | null>(null);

  useEffect(() => {
    let isActive = true;

    getLatestUserMetricsSnapshot()
      .then((snapshot) => {
        if (isActive) {
          setLatestBodyweight(snapshot.bodyweightKg);
        }
      })
      .catch((error) => {
        console.error("Error loading latest bodyweight for calculators:", error);
      });

    return () => {
      isActive = false;
    };
  }, []);

  return latestBodyweight;
}
