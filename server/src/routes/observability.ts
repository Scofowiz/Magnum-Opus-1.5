import type { Express, Request, Response } from "express";
import { convert as htmlToText } from "html-to-text";
import { CONFIG } from "../core/config.js";
import { getLogsForDate, getRecentLogs } from "../core/logger.js";
import { calculateQualityTrend, getAllMetrics } from "../core/metrics.js";

interface HealthSummary {
  provider: string;
  model: string;
  hasApiKey: boolean;
  projectCount: number;
  hasStyleFingerprint: boolean;
  craftPatternCount: number;
}

interface ProjectRepetitionSource {
  id: string;
  content?: string;
  chapters?: Array<{ content?: string }>;
}

interface FavoriteWord {
  word: string;
  count: number;
  densityPer1000: number;
  projectCount: number;
}

interface ObservabilityRoutesDeps {
  getHealthSummary(): HealthSummary;
  getProjects(): Map<string, ProjectRepetitionSource>;
  trackRequest(endpoint: string): void;
}

const STOP_WORDS = new Set([
  "a",
  "about",
  "above",
  "after",
  "again",
  "against",
  "all",
  "almost",
  "also",
  "am",
  "an",
  "and",
  "any",
  "are",
  "around",
  "as",
  "at",
  "be",
  "because",
  "been",
  "before",
  "being",
  "below",
  "between",
  "both",
  "but",
  "by",
  "can",
  "could",
  "did",
  "do",
  "does",
  "doing",
  "down",
  "during",
  "each",
  "few",
  "for",
  "from",
  "further",
  "had",
  "has",
  "have",
  "having",
  "he",
  "her",
  "here",
  "hers",
  "herself",
  "him",
  "himself",
  "his",
  "how",
  "i",
  "if",
  "in",
  "into",
  "is",
  "it",
  "its",
  "itself",
  "just",
  "me",
  "more",
  "most",
  "my",
  "myself",
  "no",
  "nor",
  "not",
  "now",
  "of",
  "off",
  "on",
  "once",
  "only",
  "or",
  "other",
  "our",
  "ours",
  "ourselves",
  "out",
  "over",
  "own",
  "same",
  "she",
  "should",
  "so",
  "some",
  "such",
  "than",
  "that",
  "the",
  "their",
  "theirs",
  "them",
  "themselves",
  "then",
  "there",
  "these",
  "they",
  "this",
  "those",
  "through",
  "to",
  "too",
  "under",
  "until",
  "up",
  "very",
  "was",
  "we",
  "were",
  "what",
  "when",
  "where",
  "which",
  "while",
  "who",
  "whom",
  "why",
  "will",
  "with",
  "would",
  "you",
  "your",
  "yours",
  "yourself",
  "yourselves",
]);

function getDateString(): string {
  return new Date().toISOString().split("T")[0];
}

function toPlainText(content: string): string {
  return htmlToText(content || "", {
    wordwrap: false,
    selectors: [
      { selector: "a", options: { ignoreHref: true } },
      { selector: "img", format: "skip" },
    ],
  })
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeWord(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/’/g, "'")
    .replace(/^['-]+|['-]+$/g, "")
    .replace(/'s$/g, "");
}

function buildRepetitionSummary(
  projects: Map<string, ProjectRepetitionSource>,
): {
  analyzedWords: number;
  filteredWords: number;
  uniqueWords: number;
  repeatCandidates: number;
  projectsAnalyzed: number;
  favoriteWords: FavoriteWord[];
} {
  const counts = new Map<string, { count: number; projectCount: number }>();
  let analyzedWords = 0;
  let filteredWords = 0;

  for (const project of projects.values()) {
    const seenInProject = new Set<string>();
    const sourceText =
      project.chapters && project.chapters.length > 0
        ? project.chapters.map((chapter) => chapter.content || "").join("\n\n")
        : project.content || "";

    const words =
      toPlainText(sourceText).match(/\b[\p{L}][\p{L}'-]*\b/gu) || [];
    analyzedWords += words.length;

    for (const rawWord of words) {
      const word = normalizeWord(rawWord);
      if (word.length < 3 || STOP_WORDS.has(word)) {
        continue;
      }

      filteredWords += 1;
      const current = counts.get(word) || { count: 0, projectCount: 0 };
      current.count += 1;
      if (!seenInProject.has(word)) {
        current.projectCount += 1;
        seenInProject.add(word);
      }
      counts.set(word, current);
    }
  }

  const favoriteWords: FavoriteWord[] = Array.from(counts.entries())
    .filter(([, entry]) => entry.count >= 3)
    .sort((left, right) => {
      if (right[1].count !== left[1].count) {
        return right[1].count - left[1].count;
      }
      if (right[1].projectCount !== left[1].projectCount) {
        return right[1].projectCount - left[1].projectCount;
      }
      return left[0].localeCompare(right[0]);
    })
    .slice(0, 12)
    .map(([word, entry]) => ({
      word,
      count: entry.count,
      densityPer1000:
        filteredWords > 0
          ? Math.round((entry.count / filteredWords) * 1000 * 10) / 10
          : 0,
      projectCount: entry.projectCount,
    }));

  return {
    analyzedWords,
    filteredWords,
    uniqueWords: counts.size,
    repeatCandidates: Array.from(counts.values()).filter(
      (entry) => entry.count >= 3,
    ).length,
    projectsAnalyzed: projects.size,
    favoriteWords,
  };
}

export function registerObservabilityRoutes(
  app: Express,
  deps: ObservabilityRoutesDeps,
): void {
  app.get("/health", (_req: Request, res: Response) => {
    deps.trackRequest("/health");
    const summary = deps.getHealthSummary();

    res.json({
      status: "ok",
      service: "magnum-opus",
      version: "1.0.0",
      provider: summary.provider,
      model: summary.model,
      hasApiKey: summary.hasApiKey,
      projectCount: summary.projectCount,
      hasStyleFingerprint: summary.hasStyleFingerprint,
      craftPatternCount: summary.craftPatternCount,
    });
  });

  app.get("/api/logs", (req: Request, res: Response) => {
    const { level, context, limit = 100 } = req.query;
    const recentLogs = getRecentLogs();

    let filtered = [...recentLogs];

    if (level && typeof level === "string") {
      filtered = filtered.filter((log) => log.level === level);
    }
    if (context && typeof context === "string") {
      filtered = filtered.filter((log) => log.context.includes(context));
    }

    filtered = filtered.slice(-Number(limit));

    res.json({
      logs: filtered,
      total: filtered.length,
      bufferSize: recentLogs.length,
    });
  });

  app.get("/api/logs/file/:date", (req: Request, res: Response) => {
    const { date } = req.params;
    const logs = getLogsForDate(date);

    if (logs.length === 0) {
      return res.status(404).json({ error: "Log file not found" });
    }

    res.json({ date, logs, count: logs.length });
  });

  app.get("/api/metrics", (_req: Request, res: Response) => {
    const now = new Date();
    const today = getDateString();
    const metrics = getAllMetrics();
    const recentLogs = getRecentLogs();
    const uptimeMs = now.getTime() - new Date(metrics.startedAt).getTime();

    const recentLatency = metrics.latency.requests.slice(-20);
    const avgLatency =
      recentLatency.length > 0
        ? recentLatency.reduce((sum, entry) => sum + entry.durationMs, 0) /
          recentLatency.length
        : 0;

    const recentErrors = recentLogs.filter(
      (log) =>
        log.level === "error" &&
        new Date(log.timestamp).getTime() > now.getTime() - 5 * 60 * 1000,
    ).length;

    let healthStatus: "healthy" | "degraded" | "unhealthy" = "healthy";
    if (
      recentErrors > CONFIG.HEALTH_ERROR_THRESHOLD_UNHEALTHY ||
      avgLatency > CONFIG.HEALTH_LATENCY_THRESHOLD_UNHEALTHY_MS
    ) {
      healthStatus = "unhealthy";
    } else if (
      recentErrors > CONFIG.HEALTH_ERROR_THRESHOLD_DEGRADED ||
      avgLatency > CONFIG.HEALTH_LATENCY_THRESHOLD_DEGRADED_MS
    ) {
      healthStatus = "degraded";
    }

    const totalRequests = Object.values(metrics.requestCounts).reduce(
      (sum, count) => sum + count,
      0,
    );
    const errorCount = recentLogs.filter((log) => log.level === "error").length;
    const successRate =
      totalRequests > 0 ? Math.max(0, 1 - errorCount / totalRequests) : 1;

    const last7Days: Record<string, number> = {};
    for (let i = 0; i < 7; i++) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split("T")[0];
      last7Days[dateStr] = metrics.tokenUsage.byDay[dateStr] || 0;
    }

    const qualityHistory = metrics.qualityScores.history;
    const avgQuality =
      qualityHistory.length > 0
        ? qualityHistory.reduce((sum, entry) => sum + entry.score, 0) /
          qualityHistory.length
        : 0;
    const recentScores = qualityHistory.slice(-10).map((entry) => entry.score);
    const repetition = buildRepetitionSummary(deps.getProjects());

    res.json({
      health: {
        status: healthStatus,
        successRate: Math.round(successRate * 100) / 100,
        avgLatencyMs: Math.round(avgLatency),
        uptimeMs,
        uptimeFormatted: `${Math.floor(uptimeMs / 3600000)}h ${Math.floor((uptimeMs % 3600000) / 60000)}m`,
      },
      tokenUsage: {
        total: metrics.tokenUsage.total,
        today: metrics.tokenUsage.byDay[today] || 0,
        byEndpoint: metrics.tokenUsage.byEndpoint,
        last7Days,
      },
      qualityScores: {
        average: Math.round(avgQuality * 100) / 100,
        trend: calculateQualityTrend(),
        recent: recentScores,
        totalScored: qualityHistory.length,
      },
      extraction: {
        totalIterations: metrics.extraction.iterations.length,
        recent: metrics.extraction.iterations.slice(-5),
      },
      requests: {
        total: totalRequests,
        byEndpoint: metrics.requestCounts,
      },
      repetition,
      startedAt: metrics.startedAt,
    });
  });
}
