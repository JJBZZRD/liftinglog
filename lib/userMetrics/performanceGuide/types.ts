import type { UserMetricKey } from "../definitions";

export type MetricType = UserMetricKey;
export type SignalKind = "acute" | "trend";
export type SignalPolarity = "positive" | "negative" | "neutral";
export type PerformanceZone = "peak" | "ready" | "stable" | "caution" | "compromised";
export type ConfidenceLabel = "high" | "medium" | "low" | "insufficient";

export type MetricEntry = {
  metric: MetricType;
  recordedAt: number;
  value: number;
  sleepStartAt?: number | null;
  sleepEndAt?: number | null;
  note?: string | null;
  context?: string | null;
  source?: string | null;
};

export type MetricAvailability = {
  metric: MetricType;
  hasAnyData: boolean;
  hasRecentData: boolean;
  recentCount: number;
  baselineCount: number;
  daysSinceLastEntry: number | null;
  acuteEligible: boolean;
  trendEligible: boolean;
  latestEntry: MetricEntry | null;
};

export type MetricBaseline = {
  metric: MetricType;
  entries: MetricEntry[];
  latestEntry: MetricEntry | null;
  recentEntries: MetricEntry[];
  baselineEntries: MetricEntry[];
  recentAverage: number | null;
  baselineAverage: number | null;
  recentMin: number | null;
  recentMax: number | null;
  baselineMin: number | null;
  baselineMax: number | null;
};

export type MetricSignalContext = {
  availability: MetricAvailability;
  baseline: MetricBaseline;
};

export type ReadinessSignal = {
  id: string;
  metric: MetricType;
  kind: SignalKind;
  polarity: SignalPolarity;
  score: number;
  magnitude: number;
  reliability: number;
  metricWeight: number;
  weightedScore: number;
  reason: string;
  evidence?: Record<string, unknown>;
};

export type PatternSignal = {
  id: string;
  metrics: MetricType[];
  polarity: SignalPolarity;
  score: number;
  magnitude: number;
  reliability: number;
  weight: number;
  weightedScore: number;
  reason: string;
  evidence?: Record<string, unknown>;
};

export type MissingDataNote = {
  id: string;
  metric: MetricType | "system";
  message: string;
};

export type PerformanceGuideInput = Partial<Record<MetricType, MetricEntry[]>>;
export type MetricAvailabilityMap = Record<MetricType, MetricAvailability>;
export type MetricBaselineMap = Record<MetricType, MetricBaseline>;

export type PerformanceGuideResult = {
  zone: PerformanceZone | null;
  normalizedScore: number | null;
  confidence: number;
  confidenceLabel: ConfidenceLabel;
  summary: string;
  reasons: string[];
  missingDataNotes: MissingDataNote[];
  signals: ReadinessSignal[];
  patterns: PatternSignal[];
  availabilityByMetric: MetricAvailabilityMap;
  contributingMetrics: MetricType[];
  dominantMetrics: MetricType[];
  basedMostlyOnSingleMetric: boolean;
  totalWeightedScore: number;
  availableInfluence: number;
};

