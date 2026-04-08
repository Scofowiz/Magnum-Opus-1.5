/**
 * Metrics Tracking Module
 *
 * Provides centralized metrics collection for:
 * - Token usage tracking
 * - Quality score history
 * - Request latency
 * - Extraction statistics
 */

import {
  MetricsData,
  QualityTrend,
  TokenUsage,
  QualityScoreEntry,
  LatencyEntry,
  ExtractionEntry,
} from "./types.js";

// ============================================================================
// CONFIGURATION
// ============================================================================

const MAX_QUALITY_HISTORY = 100;
const MAX_LATENCY_HISTORY = 100;
const MAX_EXTRACTION_HISTORY = 50;
const QUALITY_TREND_SAMPLE_SIZE = 10;
const QUALITY_TREND_THRESHOLD = 0.05;
const METRICS_FLUSH_DEBOUNCE_MS = 2000;

// ============================================================================
// STATE
// ============================================================================

let metrics: MetricsData = createInitialMetrics();
let persistMetrics: ((snapshot: MetricsData) => void) | null = null;
let pendingFlushTimer: ReturnType<typeof setTimeout> | null = null;

// ============================================================================
// INITIALIZATION
// ============================================================================

function createInitialMetrics(): MetricsData {
  return {
    tokenUsage: { total: 0, byEndpoint: {}, byDay: {} },
    qualityScores: { history: [] },
    latency: { requests: [] },
    extraction: { iterations: [] },
    requestCounts: {},
    startedAt: new Date().toISOString(),
  };
}

function cloneMetrics(): MetricsData {
  return {
    ...metrics,
    tokenUsage: { ...metrics.tokenUsage },
    qualityScores: { history: [...metrics.qualityScores.history] },
    latency: { requests: [...metrics.latency.requests] },
    extraction: { iterations: [...metrics.extraction.iterations] },
    requestCounts: { ...metrics.requestCounts },
  };
}

function flushMetrics(immediate = false): void {
  if (!persistMetrics) {
    return;
  }

  if (pendingFlushTimer) {
    clearTimeout(pendingFlushTimer);
    pendingFlushTimer = null;
  }

  if (immediate) {
    persistMetrics(cloneMetrics());
    return;
  }

  pendingFlushTimer = setTimeout(() => {
    pendingFlushTimer = null;
    if (persistMetrics) {
      persistMetrics(cloneMetrics());
    }
  }, METRICS_FLUSH_DEBOUNCE_MS);
}

/**
 * Reset all metrics to initial state
 */
export function resetMetrics(): void {
  metrics = createInitialMetrics();
  flushMetrics(true);
}

/**
 * Initialize metrics from a persisted snapshot and configure persistence.
 */
export function initializeMetrics(
  initialMetrics?: MetricsData,
  onPersist?: (snapshot: MetricsData) => void,
): void {
  metrics = initialMetrics
    ? {
        ...createInitialMetrics(),
        ...initialMetrics,
        tokenUsage: {
          ...createInitialMetrics().tokenUsage,
          ...initialMetrics.tokenUsage,
        },
        qualityScores: {
          history: [...(initialMetrics.qualityScores?.history || [])],
        },
        latency: { requests: [...(initialMetrics.latency?.requests || [])] },
        extraction: {
          iterations: [...(initialMetrics.extraction?.iterations || [])],
        },
        requestCounts: { ...(initialMetrics.requestCounts || {}) },
      }
    : createInitialMetrics();

  metrics.startedAt = new Date().toISOString();
  persistMetrics = onPersist || null;
  flushMetrics(true);
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function getDateString(): string {
  return new Date().toISOString().split("T")[0];
}

function trimArray<T>(array: T[], maxLength: number): T[] {
  if (array.length > maxLength) {
    return array.slice(-maxLength);
  }
  return array;
}

// ============================================================================
// TOKEN TRACKING
// ============================================================================

/**
 * Track token usage for an endpoint
 */
export function trackTokens(endpoint: string, tokens: number): void {
  const day = getDateString();

  metrics.tokenUsage.total += tokens;
  metrics.tokenUsage.byEndpoint[endpoint] =
    (metrics.tokenUsage.byEndpoint[endpoint] || 0) + tokens;
  metrics.tokenUsage.byDay[day] = (metrics.tokenUsage.byDay[day] || 0) + tokens;
  flushMetrics();
}

/**
 * Get current token usage statistics
 */
export function getTokenUsage(): TokenUsage {
  return { ...metrics.tokenUsage };
}

// ============================================================================
// QUALITY SCORE TRACKING
// ============================================================================

/**
 * Track a quality score for an endpoint
 */
export function trackQualityScore(endpoint: string, score: number): void {
  const entry: QualityScoreEntry = {
    timestamp: new Date().toISOString(),
    score,
    endpoint,
  };

  metrics.qualityScores.history.push(entry);
  metrics.qualityScores.history = trimArray(
    metrics.qualityScores.history,
    MAX_QUALITY_HISTORY,
  );
  flushMetrics();
}

/**
 * Calculate the trend of quality scores
 */
export function calculateQualityTrend(): QualityTrend {
  const history = metrics.qualityScores.history;

  if (history.length < QUALITY_TREND_SAMPLE_SIZE) {
    return "stable";
  }

  const recent = history.slice(-QUALITY_TREND_SAMPLE_SIZE).map((h) => h.score);
  const older = history
    .slice(-QUALITY_TREND_SAMPLE_SIZE * 2, -QUALITY_TREND_SAMPLE_SIZE)
    .map((h) => h.score);

  if (older.length === 0) {
    return "stable";
  }

  const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
  const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;

  if (recentAvg > olderAvg + QUALITY_TREND_THRESHOLD) return "improving";
  if (recentAvg < olderAvg - QUALITY_TREND_THRESHOLD) return "declining";
  return "stable";
}

/**
 * Get quality score statistics
 */
export function getQualityStats(): {
  average: number;
  min: number;
  max: number;
  trend: QualityTrend;
  history: QualityScoreEntry[];
} {
  const history = metrics.qualityScores.history;

  if (history.length === 0) {
    return {
      average: 0,
      min: 0,
      max: 0,
      trend: "stable",
      history: [],
    };
  }

  const scores = history.map((h) => h.score);

  return {
    average: scores.reduce((a, b) => a + b, 0) / scores.length,
    min: Math.min(...scores),
    max: Math.max(...scores),
    trend: calculateQualityTrend(),
    history: [...history],
  };
}

// ============================================================================
// LATENCY TRACKING
// ============================================================================

/**
 * Track request latency for an endpoint
 */
export function trackLatency(endpoint: string, durationMs: number): void {
  const entry: LatencyEntry = {
    timestamp: new Date().toISOString(),
    endpoint,
    durationMs,
  };

  metrics.latency.requests.push(entry);
  metrics.latency.requests = trimArray(
    metrics.latency.requests,
    MAX_LATENCY_HISTORY,
  );
  flushMetrics();
}

/**
 * Get latency statistics
 */
export function getLatencyStats(): {
  average: number;
  p50: number;
  p95: number;
  p99: number;
  requests: LatencyEntry[];
} {
  const requests = metrics.latency.requests;

  if (requests.length === 0) {
    return {
      average: 0,
      p50: 0,
      p95: 0,
      p99: 0,
      requests: [],
    };
  }

  const durations = requests.map((r) => r.durationMs).sort((a, b) => a - b);

  const percentile = (p: number): number => {
    const index = Math.ceil((p / 100) * durations.length) - 1;
    return durations[Math.max(0, index)];
  };

  return {
    average: durations.reduce((a, b) => a + b, 0) / durations.length,
    p50: percentile(50),
    p95: percentile(95),
    p99: percentile(99),
    requests: [...requests],
  };
}

// ============================================================================
// REQUEST TRACKING
// ============================================================================

/**
 * Track a request to an endpoint
 */
export function trackRequest(endpoint: string): void {
  metrics.requestCounts[endpoint] = (metrics.requestCounts[endpoint] || 0) + 1;
  flushMetrics();
}

/**
 * Get request counts by endpoint
 */
export function getRequestCounts(): Record<string, number> {
  return { ...metrics.requestCounts };
}

// ============================================================================
// EXTRACTION TRACKING
// ============================================================================

/**
 * Track extraction iteration statistics
 */
export function trackExtraction(
  passesRun: number,
  charactersFound: number,
  newAdded: number,
  duplicatesSkipped: number,
  enriched: number,
): void {
  const entry: ExtractionEntry = {
    timestamp: new Date().toISOString(),
    passesRun,
    charactersFound,
    newAdded,
    duplicatesSkipped,
    enriched,
  };

  metrics.extraction.iterations.push(entry);
  metrics.extraction.iterations = trimArray(
    metrics.extraction.iterations,
    MAX_EXTRACTION_HISTORY,
  );
  flushMetrics();
}

/**
 * Get extraction statistics
 */
export function getExtractionStats(): {
  totalIterations: number;
  averageCharactersFound: number;
  totalNewAdded: number;
  iterations: ExtractionEntry[];
} {
  const iterations = metrics.extraction.iterations;

  if (iterations.length === 0) {
    return {
      totalIterations: 0,
      averageCharactersFound: 0,
      totalNewAdded: 0,
      iterations: [],
    };
  }

  const totalCharacters = iterations.reduce((a, b) => a + b.charactersFound, 0);
  const totalNew = iterations.reduce((a, b) => a + b.newAdded, 0);

  return {
    totalIterations: iterations.length,
    averageCharactersFound: totalCharacters / iterations.length,
    totalNewAdded: totalNew,
    iterations: [...iterations],
  };
}

// ============================================================================
// FULL METRICS ACCESS
// ============================================================================

/**
 * Get all metrics data
 */
export function getAllMetrics(): MetricsData {
  return cloneMetrics();
}

/**
 * Get uptime in seconds
 */
export function getUptime(): number {
  const started = new Date(metrics.startedAt).getTime();
  return Math.floor((Date.now() - started) / 1000);
}
