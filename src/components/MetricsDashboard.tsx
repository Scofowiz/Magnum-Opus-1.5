import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from "react";
import { api } from "../api/client";

const GLASS_PANEL_STYLE: CSSProperties = {
  background:
    "linear-gradient(180deg, rgba(255, 252, 247, 0.8), rgba(255, 248, 242, 0.68))",
  backdropFilter: "blur(16px)",
  WebkitBackdropFilter: "blur(16px)",
  border: "1px solid rgba(120, 113, 108, 0.18)",
  boxShadow: "0 20px 48px rgba(33, 24, 18, 0.1)",
};

const GLASS_PANEL_STYLE_SOFT: CSSProperties = {
  background:
    "linear-gradient(180deg, rgba(255, 252, 247, 0.72), rgba(255, 248, 242, 0.6))",
  backdropFilter: "blur(14px)",
  WebkitBackdropFilter: "blur(14px)",
  border: "1px solid rgba(120, 113, 108, 0.14)",
  boxShadow: "0 16px 36px rgba(33, 24, 18, 0.08)",
};

const PARTICLES = [
  { top: "7%", left: "12%", size: 3, delay: "0s" },
  { top: "14%", left: "78%", size: 2, delay: "0.6s" },
  { top: "28%", left: "63%", size: 4, delay: "1.1s" },
  { top: "49%", left: "18%", size: 2, delay: "0.3s" },
  { top: "56%", left: "88%", size: 3, delay: "1.6s" },
  { top: "73%", left: "8%", size: 4, delay: "0.8s" },
  { top: "82%", left: "57%", size: 2, delay: "1.3s" },
  { top: "90%", left: "32%", size: 3, delay: "0.2s" },
];

interface Metrics {
  health: {
    status: "healthy" | "degraded" | "unhealthy";
    successRate: number;
    avgLatencyMs: number;
    uptimeMs: number;
    uptimeFormatted: string;
  };
  tokenUsage: {
    total: number;
    today: number;
    byEndpoint: Record<string, number>;
    last7Days: Record<string, number>;
  };
  qualityScores: {
    average: number;
    trend: "improving" | "stable" | "declining";
    recent: number[];
    totalScored: number;
  };
  extraction: {
    totalIterations: number;
    recent: {
      timestamp: string;
      passesRun: number;
      charactersFound: number;
      newAdded: number;
      duplicatesSkipped: number;
      enriched: number;
    }[];
  };
  requests: {
    total: number;
    byEndpoint: Record<string, number>;
  };
  repetition: {
    analyzedWords: number;
    filteredWords: number;
    uniqueWords: number;
    repeatCandidates: number;
    projectsAnalyzed: number;
    favoriteWords: Array<{
      word: string;
      count: number;
      densityPer1000: number;
      projectCount: number;
    }>;
  };
  startedAt: string;
}

interface LogEntry {
  timestamp: string;
  level: "debug" | "info" | "warn" | "error";
  context: string;
  message: string;
  data?: unknown;
}

type LogLevelFilter = "all" | LogEntry["level"];

interface MetricCardProps {
  eyebrow: string;
  title: string;
  value: string;
  detail: string;
  badge?: ReactNode;
  accent?: ReactNode;
}

interface SectionCardProps {
  title: string;
  subtitle: string;
  rightSlot?: ReactNode;
  children: ReactNode;
}

function formatInteger(value: number): string {
  return new Intl.NumberFormat("en-US").format(Math.round(value));
}

function formatCompact(value: number): string {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function formatLatency(value: number): string {
  if (value >= 1000) {
    return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}s`;
  }
  return `${Math.round(value)}ms`;
}

function formatDensityPerThousand(value: number): string {
  return `${value.toFixed(value >= 10 ? 0 : 1)}/1k`;
}

function formatQuality(score: number): string {
  const normalized = score <= 1 ? score * 100 : score;
  return `${Math.round(Math.max(0, Math.min(normalized, 100)))}`;
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatTime(value: string): string {
  return new Date(value).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function humanizeEndpoint(endpoint: string): string {
  const cleaned = endpoint.replace(/^\/api\//, "").replace(/^\/+/, "");
  return cleaned || endpoint;
}

function buildSparklinePoints(
  values: number[],
  width = 440,
  height = 136,
): string {
  if (values.length === 0) return "";

  return values
    .map((value, index) => {
      const normalized = Number(formatQuality(value));
      const x =
        values.length === 1 ? width / 2 : (index / (values.length - 1)) * width;
      const y = height - (normalized / 100) * height;
      return `${x},${y}`;
    })
    .join(" ");
}

function MetricCard({
  eyebrow,
  title,
  value,
  detail,
  badge,
  accent,
}: MetricCardProps): ReactElement {
  return (
    <div
      style={GLASS_PANEL_STYLE}
      className="relative overflow-hidden rounded-[28px] px-5 py-5 text-white"
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent" />
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.26em] text-white/55">
            {eyebrow}
          </div>
          <div>
            <div className="text-sm font-medium text-white/68">{title}</div>
            <div className="mt-1 text-3xl font-semibold tracking-tight text-white">
              {value}
            </div>
          </div>
          <p className="max-w-[24rem] text-sm leading-6 text-white/72">
            {detail}
          </p>
        </div>
        {badge ? <div className="shrink-0">{badge}</div> : null}
      </div>
      {accent ? <div className="mt-5">{accent}</div> : null}
    </div>
  );
}

function SectionCard({
  title,
  subtitle,
  rightSlot,
  children,
}: SectionCardProps): ReactElement {
  return (
    <section
      style={GLASS_PANEL_STYLE_SOFT}
      className="relative overflow-hidden rounded-[30px] p-5 text-white sm:p-6"
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-stone-300/35 to-transparent" />
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <h2 className="text-lg font-semibold tracking-tight text-white">
            {title}
          </h2>
          <p className="max-w-2xl text-sm leading-6 text-white/62">
            {subtitle}
          </p>
        </div>
        {rightSlot ? <div className="shrink-0">{rightSlot}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function MetricsDashboard(): ReactElement {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [activeLevel, setActiveLevel] = useState<LogLevelFilter>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const fetchData = async (background = false): Promise<void> => {
    if (background) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }

    try {
      const [metricsData, logsData] = (await Promise.all([
        api.metrics.get(),
        api.logs.list(80),
      ])) as [Metrics, { logs: LogEntry[] }];

      setMetrics(metricsData);
      setLogs(logsData.logs || []);
      setLastUpdated(new Date().toISOString());
      setError(null);
    } catch (fetchError) {
      setError(
        fetchError instanceof Error ? fetchError.message : String(fetchError),
      );
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    void fetchData();
    const interval = setInterval(() => {
      void fetchData(true);
    }, 10000);
    return (): void => clearInterval(interval);
  }, []);

  const levelCounts = useMemo(() => {
    return logs.reduce(
      (counts, log) => {
        counts[log.level] += 1;
        counts.all += 1;
        return counts;
      },
      { all: 0, debug: 0, info: 0, warn: 0, error: 0 },
    );
  }, [logs]);

  const filteredLogs = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return logs
      .filter((log) => activeLevel === "all" || log.level === activeLevel)
      .filter((log) => {
        if (!query) return true;
        return `${log.context} ${log.message}`.toLowerCase().includes(query);
      })
      .slice()
      .reverse();
  }, [activeLevel, logs, searchTerm]);

  const endpointRows = useMemo(() => {
    if (!metrics) return [];

    const totalRequests = metrics.requests.total || 1;

    return Object.entries(metrics.requests.byEndpoint)
      .map(([endpoint, requestCount]) => {
        const tokens = metrics.tokenUsage.byEndpoint[endpoint] || 0;
        return {
          endpoint,
          requestCount,
          tokens,
          share: requestCount / totalRequests,
          tokensPerRequest: requestCount > 0 ? tokens / requestCount : 0,
        };
      })
      .sort((left, right) => {
        if (right.requestCount !== left.requestCount) {
          return right.requestCount - left.requestCount;
        }
        return right.tokens - left.tokens;
      });
  }, [metrics]);

  const noisyContexts = useMemo(() => {
    const grouped = new Map<
      string,
      {
        context: string;
        entries: number;
        errors: number;
        warns: number;
        lastTimestamp: string;
        lastMessage: string;
      }
    >();

    for (const log of logs) {
      const key = log.context || "general";
      const current = grouped.get(key) || {
        context: key,
        entries: 0,
        errors: 0,
        warns: 0,
        lastTimestamp: log.timestamp,
        lastMessage: log.message,
      };

      current.entries += 1;
      current.lastTimestamp = log.timestamp;
      current.lastMessage = log.message;

      if (log.level === "error") current.errors += 1;
      if (log.level === "warn") current.warns += 1;

      grouped.set(key, current);
    }

    return Array.from(grouped.values())
      .map((entry) => ({
        ...entry,
        score: entry.errors * 4 + entry.warns * 2 + entry.entries * 0.2,
      }))
      .sort((left, right) => right.score - left.score)
      .slice(0, 6);
  }, [logs]);

  const qualityPercentages = useMemo(() => {
    if (!metrics) return [];
    return metrics.qualityScores.recent.map((score) =>
      Number(formatQuality(score)),
    );
  }, [metrics]);

  const qualityDelta = useMemo(() => {
    if (!qualityPercentages.length || qualityPercentages.length < 4)
      return null;

    const midpoint = Math.floor(qualityPercentages.length / 2);
    const older = qualityPercentages.slice(0, midpoint);
    const recent = qualityPercentages.slice(midpoint);

    if (!older.length || !recent.length) return null;

    const olderAverage =
      older.reduce((sum, value) => sum + value, 0) / older.length;
    const recentAverage =
      recent.reduce((sum, value) => sum + value, 0) / recent.length;

    return Math.round((recentAverage - olderAverage) * 10) / 10;
  }, [qualityPercentages]);

  const last7DayTokens = useMemo(() => {
    if (!metrics) return [];

    return Object.entries(metrics.tokenUsage.last7Days)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([date, tokens]) => ({ date, tokens }));
  }, [metrics]);

  const favoriteWords = metrics?.repetition.favoriteWords || [];
  const topFavoriteWord = favoriteWords[0] || null;

  const decisionItems = useMemo(() => {
    if (!metrics) return [];

    const items: { title: string; detail: string }[] = [];
    const topEndpoint = endpointRows[0];
    const noisiest = noisyContexts[0];

    if (topFavoriteWord && topFavoriteWord.densityPer1000 >= 8) {
      items.push({
        title: "One word is carrying too much weight",
        detail: `"${topFavoriteWord.word}" appears ${formatInteger(topFavoriteWord.count)} times at ${formatDensityPerThousand(topFavoriteWord.densityPer1000)} filtered words. Trim or vary it before the next pass.`,
      });
    }

    if (topEndpoint && topEndpoint.share >= 0.45) {
      items.push({
        title: "Traffic is concentrated",
        detail: `${humanizeEndpoint(topEndpoint.endpoint)} carries ${Math.round(topEndpoint.share * 100)}% of requests. Watch saturation before drift appears elsewhere.`,
      });
    }

    if (metrics.qualityScores.trend === "declining") {
      items.push({
        title: "Quality trend is slipping",
        detail: `Recent quality is down${qualityDelta ? ` ${Math.abs(qualityDelta).toFixed(1)} points` : ""}. Review prompt grounding and noisy logs before autonomous runs.`,
      });
    }

    if (noisiest && (noisiest.errors > 0 || noisiest.warns > 0)) {
      items.push({
        title: "One context is creating most of the noise",
        detail: `${noisiest.context} produced ${noisiest.errors} errors and ${noisiest.warns} warnings in the buffered logs.`,
      });
    }

    if (!items.length) {
      items.push({
        title: "No immediate operator action",
        detail:
          "No repetition hotspot is dominating, quality is not deteriorating, and log noise is currently contained.",
      });
    }

    return items.slice(0, 3);
  }, [endpointRows, metrics, noisyContexts, qualityDelta, topFavoriteWord]);

  if (isLoading && !metrics) {
    return (
      <div className="metrics-shell mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div
          style={GLASS_PANEL_STYLE}
          className="rounded-[32px] px-6 py-16 text-center text-white"
        >
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-white/20 border-t-stone-500" />
          <p className="text-base font-medium text-white">
            Loading operational metrics
          </p>
          <p className="mt-2 text-sm text-white/60">
            Pulling repetition, traffic, quality, and log data from the server.
          </p>
        </div>
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className="metrics-shell mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div
          style={GLASS_PANEL_STYLE}
          className="rounded-[32px] border border-rose-200/20 px-6 py-8 text-rose-100"
        >
          <div className="text-lg font-semibold">Metrics unavailable</div>
          <p className="mt-2 text-sm text-rose-100/80">
            {error || "No metrics payload was returned."}
          </p>
        </div>
      </div>
    );
  }

  const topEndpoint = endpointRows[0];
  const heaviestTokenEndpoint = [...endpointRows].sort(
    (left, right) => right.tokens - left.tokens,
  )[0];
  const totalRequests = metrics.requests.total;
  const totalEndpoints = endpointRows.length;
  const qualityPoints = buildSparklinePoints(metrics.qualityScores.recent);
  const maxTokenDay = Math.max(
    ...last7DayTokens.map((entry) => entry.tokens),
    1,
  );
  const favoriteWordMax = Math.max(
    ...favoriteWords.map((entry) => entry.count),
    1,
  );

  return (
    <div className="metrics-shell mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="relative overflow-hidden rounded-[36px] px-5 py-5 sm:px-6 sm:py-6">
        <div className="pointer-events-none absolute inset-0 -z-20 bg-[radial-gradient(circle_at_top,rgba(214,211,209,0.16),transparent_38%),linear-gradient(180deg,rgba(255,252,247,0.86),rgba(255,248,242,0.74))]" />
        <div className="pointer-events-none absolute inset-0 -z-10">
          {PARTICLES.map((particle, index) => (
            <span
              key={`${particle.top}-${particle.left}-${index}`}
              className="absolute rounded-full bg-stone-200/55 animate-pulse"
              style={{
                top: particle.top,
                left: particle.left,
                width: particle.size,
                height: particle.size,
                animationDelay: particle.delay,
                boxShadow: "0 0 18px rgba(168, 162, 158, 0.18)",
              }}
            />
          ))}
        </div>

        <div className="space-y-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.26em] text-stone-700">
                Observability
              </div>
              <div>
                <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-[2.1rem]">
                  Metrics that answer what to do next
                </h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-white/65 sm:text-[15px]">
                  Read repetition first, then latency, traffic, token burn,
                  quality drift, and the loudest logs. This view is tuned for
                  decisions, not decoration.
                </p>
              </div>
            </div>

            <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
              <div className="text-sm text-white/58">
                {lastUpdated
                  ? `Last updated ${formatTime(lastUpdated)}`
                  : "Waiting for first refresh"}
              </div>
              <button
                type="button"
                onClick={() => void fetchData(true)}
                className="inline-flex items-center gap-2 rounded-full border border-stone-300/40 bg-stone-200/45 px-4 py-2 text-sm font-medium text-stone-800 transition hover:bg-stone-200/60"
              >
                <span
                  className={`h-2 w-2 rounded-full bg-stone-500 ${isRefreshing ? "animate-pulse" : ""}`}
                />
                {isRefreshing ? "Refreshing" : "Refresh now"}
              </button>
            </div>
          </div>

          {error ? (
            <div className="rounded-[24px] border border-rose-200/20 bg-rose-300/10 px-4 py-3 text-sm text-rose-100">
              Latest refresh failed: {error}
            </div>
          ) : null}

          <SectionCard
            title="Decision board"
            subtitle="The short list of issues most likely to affect reliability or output quality in the next session."
          >
            <div className="grid gap-3 lg:grid-cols-3">
              {decisionItems.map((item) => (
                <div
                  key={item.title}
                  className="rounded-[22px] border border-white/10 bg-white/6 px-4 py-4"
                >
                  <div className="text-sm font-semibold text-stone-800">
                    {item.title}
                  </div>
                  <p className="mt-2 text-sm leading-6 text-white/68">
                    {item.detail}
                  </p>
                </div>
              ))}
            </div>
          </SectionCard>

          <div className="grid gap-4 xl:grid-cols-4">
            <div className="xl:col-span-2">
              <MetricCard
                eyebrow="Repetition"
                title="Favorite word watch"
                value={topFavoriteWord ? topFavoriteWord.word : "Clear"}
                detail={
                  topFavoriteWord
                    ? `"${topFavoriteWord.word}" shows up ${formatInteger(topFavoriteWord.count)} times across ${formatCompact(metrics.repetition.filteredWords)} filtered words. Common glue words like "the" and "and" are ignored.`
                    : metrics.repetition.filteredWords > 0
                      ? "No word has crossed the repetition threshold yet."
                      : "Write a little more chapter text and this panel will surface favorite-word patterns."
                }
                badge={
                  <div className="inline-flex items-center gap-2 rounded-full border border-stone-300/35 bg-stone-200/45 px-3 py-1 text-sm font-medium text-stone-700">
                    <span className="h-2.5 w-2.5 rounded-full bg-stone-500" />
                    <span>Stop words filtered</span>
                  </div>
                }
                accent={
                  <div className="grid gap-3 lg:grid-cols-[0.8fr_1.2fr]">
                    <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
                      <div className="rounded-[20px] border border-white/10 bg-black/10 px-4 py-3">
                        <div className="text-[11px] uppercase tracking-[0.22em] text-white/45">
                          Projects analyzed
                        </div>
                        <div className="mt-2 text-base font-semibold text-white">
                          {metrics.repetition.projectsAnalyzed}
                        </div>
                      </div>
                      <div className="rounded-[20px] border border-white/10 bg-black/10 px-4 py-3">
                        <div className="text-[11px] uppercase tracking-[0.22em] text-white/45">
                          Unique filtered words
                        </div>
                        <div className="mt-2 text-base font-semibold text-white">
                          {formatCompact(metrics.repetition.uniqueWords)}
                        </div>
                      </div>
                      <div className="rounded-[20px] border border-white/10 bg-black/10 px-4 py-3">
                        <div className="text-[11px] uppercase tracking-[0.22em] text-white/45">
                          Repeat candidates
                        </div>
                        <div className="mt-2 text-base font-semibold text-white">
                          {formatInteger(metrics.repetition.repeatCandidates)}
                        </div>
                      </div>
                    </div>

                    <div className="rounded-[20px] border border-white/10 bg-black/10 px-4 py-3">
                      <div className="mb-3 text-[11px] uppercase tracking-[0.22em] text-white/45">
                        Top repeated words
                      </div>
                      {favoriteWords.length > 0 ? (
                        <div className="space-y-3">
                          {favoriteWords.slice(0, 5).map((entry, index) => (
                            <div key={entry.word}>
                              <div className="flex items-center justify-between gap-3 text-sm">
                                <div className="font-medium text-white">
                                  {index + 1}. {entry.word}
                                </div>
                                <div className="text-white/72">
                                  {formatInteger(entry.count)} uses
                                </div>
                              </div>
                              <div className="mt-1 flex items-center justify-between gap-3 text-xs text-white/48">
                                <span>
                                  {formatDensityPerThousand(
                                    entry.densityPer1000,
                                  )}
                                </span>
                                <span>
                                  {entry.projectCount} project
                                  {entry.projectCount === 1 ? "" : "s"}
                                </span>
                              </div>
                              <div className="mt-2 h-1.5 rounded-full bg-white/8">
                                <div
                                  className="h-1.5 rounded-full bg-gradient-to-r from-stone-600 to-stone-200"
                                  style={{
                                    width: `${Math.max(10, (entry.count / favoriteWordMax) * 100)}%`,
                                  }}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="rounded-[18px] border border-dashed border-white/10 px-3 py-6 text-center text-sm text-white/52">
                          No meaningful repetition signal yet.
                        </div>
                      )}
                    </div>
                  </div>
                }
              />
            </div>

            <MetricCard
              eyebrow="Latency"
              title="Average response time"
              value={formatLatency(metrics.health.avgLatencyMs)}
              detail={
                metrics.health.avgLatencyMs >= 3000
                  ? "Latency is in the danger band. Expect degraded interactive writing flow."
                  : metrics.health.avgLatencyMs >= 1500
                    ? "Latency is elevated. Watch prompt size and hot endpoints."
                    : "Latency is within a workable range for interactive generation."
              }
              accent={
                <div className="rounded-[20px] border border-white/10 bg-black/10 px-4 py-3">
                  <div className="text-[11px] uppercase tracking-[0.22em] text-white/45">
                    Interpretation
                  </div>
                  <div className="mt-2 text-sm font-medium text-stone-700">
                    {metrics.health.avgLatencyMs < 800
                      ? "Fast"
                      : metrics.health.avgLatencyMs < 1500
                        ? "Acceptable"
                        : metrics.health.avgLatencyMs < 3000
                          ? "Watch closely"
                          : "Immediate action"}
                  </div>
                </div>
              }
            />

            <MetricCard
              eyebrow="Requests"
              title="Traffic volume"
              value={formatCompact(totalRequests)}
              detail={
                topEndpoint
                  ? `${humanizeEndpoint(topEndpoint.endpoint)} is the busiest route at ${Math.round(topEndpoint.share * 100)}% of total traffic.`
                  : "No request traffic has been recorded yet."
              }
              accent={
                <div className="rounded-[20px] border border-white/10 bg-black/10 px-4 py-3">
                  <div className="text-[11px] uppercase tracking-[0.22em] text-white/45">
                    Tracked endpoints
                  </div>
                  <div className="mt-2 text-base font-semibold text-white">
                    {totalEndpoints}
                  </div>
                </div>
              }
            />

            <MetricCard
              eyebrow="Tokens"
              title="Usage pressure"
              value={formatCompact(metrics.tokenUsage.today)}
              detail={
                heaviestTokenEndpoint
                  ? `${humanizeEndpoint(heaviestTokenEndpoint.endpoint)} consumed ${formatCompact(heaviestTokenEndpoint.tokens)} tokens.`
                  : "Token usage has not been recorded yet."
              }
              accent={
                <div className="rounded-[20px] border border-white/10 bg-black/10 px-4 py-3">
                  <div className="text-[11px] uppercase tracking-[0.22em] text-white/45">
                    7-day total
                  </div>
                  <div className="mt-2 text-base font-semibold text-white">
                    {formatCompact(
                      last7DayTokens.reduce(
                        (sum, entry) => sum + entry.tokens,
                        0,
                      ),
                    )}
                  </div>
                </div>
              }
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
            <SectionCard
              title="Quality trend"
              subtitle="Recent score movement is more useful than a single average. This panel shows trend direction and whether quality is drifting."
              rightSlot={
                <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm text-white/72">
                  <span className="text-stone-700">
                    {metrics.qualityScores.trend === "improving"
                      ? "↑"
                      : metrics.qualityScores.trend === "declining"
                        ? "↓"
                        : "→"}
                  </span>
                  <span className="capitalize">
                    {metrics.qualityScores.trend}
                  </span>
                </div>
              }
            >
              <div className="grid gap-5 lg:grid-cols-[0.75fr_1.25fr]">
                <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
                  <div className="rounded-[22px] border border-white/10 bg-white/6 px-4 py-4">
                    <div className="text-[11px] uppercase tracking-[0.22em] text-white/45">
                      Average quality
                    </div>
                    <div className="mt-2 text-3xl font-semibold text-white">
                      {formatQuality(metrics.qualityScores.average)}
                    </div>
                    <div className="mt-1 text-sm text-white/60">out of 100</div>
                  </div>
                  <div className="rounded-[22px] border border-white/10 bg-white/6 px-4 py-4">
                    <div className="text-[11px] uppercase tracking-[0.22em] text-white/45">
                      Recent change
                    </div>
                    <div className="mt-2 text-3xl font-semibold text-white">
                      {qualityDelta === null
                        ? "n/a"
                        : `${qualityDelta > 0 ? "+" : ""}${qualityDelta}`}
                    </div>
                    <div className="mt-1 text-sm text-white/60">
                      versus prior window
                    </div>
                  </div>
                  <div className="rounded-[22px] border border-white/10 bg-white/6 px-4 py-4">
                    <div className="text-[11px] uppercase tracking-[0.22em] text-white/45">
                      Samples scored
                    </div>
                    <div className="mt-2 text-3xl font-semibold text-white">
                      {formatInteger(metrics.qualityScores.totalScored)}
                    </div>
                    <div className="mt-1 text-sm text-white/60">
                      confidence grows with volume
                    </div>
                  </div>
                </div>

                <div className="rounded-[24px] border border-white/10 bg-black/10 p-4">
                  {metrics.qualityScores.recent.length > 0 ? (
                    <>
                      <div className="flex items-center justify-between text-xs uppercase tracking-[0.2em] text-white/40">
                        <span>Older</span>
                        <span>Recent</span>
                      </div>
                      <div className="mt-4 h-40">
                        <svg
                          viewBox="0 0 440 160"
                          className="h-full w-full overflow-visible"
                        >
                          {[25, 50, 75].map((marker) => (
                            <line
                              key={marker}
                              x1="0"
                              y1={160 - marker * 1.36}
                              x2="440"
                              y2={160 - marker * 1.36}
                              stroke="rgba(255,255,255,0.08)"
                              strokeDasharray="4 8"
                            />
                          ))}
                          <polyline
                            fill="none"
                            stroke="rgba(120,113,108,0.9)"
                            strokeWidth="4"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            points={qualityPoints}
                          />
                          <polyline
                            fill="url(#qualityFill)"
                            stroke="none"
                            points={`0,160 ${qualityPoints} 440,160`}
                          />
                          <defs>
                            <linearGradient
                              id="qualityFill"
                              x1="0"
                              y1="0"
                              x2="0"
                              y2="1"
                            >
                              <stop
                                offset="0%"
                                stopColor="rgba(120,113,108,0.16)"
                              />
                              <stop
                                offset="100%"
                                stopColor="rgba(120,113,108,0.01)"
                              />
                            </linearGradient>
                          </defs>
                        </svg>
                      </div>
                      <div className="mt-4 grid gap-3 sm:grid-cols-3">
                        {qualityPercentages.slice(-3).map((score, index) => (
                          <div
                            key={`${score}-${index}`}
                            className="rounded-[18px] border border-white/10 bg-white/5 px-3 py-3"
                          >
                            <div className="text-[11px] uppercase tracking-[0.22em] text-white/42">
                              Recent sample
                            </div>
                            <div className="mt-1 text-lg font-semibold text-white">
                              {score}
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="flex h-full min-h-[220px] items-center justify-center rounded-[20px] border border-dashed border-white/10 text-sm text-white/52">
                      No quality scores recorded yet.
                    </div>
                  )}
                </div>
              </div>
            </SectionCard>

            <SectionCard
              title="Token burn by day"
              subtitle="Use this to spot sudden jumps in context size or repeated retries."
            >
              <div className="space-y-3">
                {last7DayTokens.map((entry) => (
                  <div
                    key={entry.date}
                    className="rounded-[22px] border border-white/10 bg-white/6 px-4 py-4"
                  >
                    <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                      <span className="font-medium text-white">
                        {entry.date}
                      </span>
                      <span className="text-white/70">
                        {formatCompact(entry.tokens)} tokens
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-white/8">
                      <div
                        className="h-2 rounded-full bg-gradient-to-r from-stone-600 via-stone-400 to-stone-200"
                        style={{
                          width: `${Math.max(6, (entry.tokens / maxTokenDay) * 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
            <SectionCard
              title="Top endpoints"
              subtitle="These routes create the most system pressure. Read request share first, then token intensity to find costly hotspots."
            >
              {endpointRows.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="text-[11px] uppercase tracking-[0.22em] text-white/42">
                      <tr>
                        <th className="pb-3 pr-4 font-medium">Endpoint</th>
                        <th className="pb-3 pr-4 font-medium text-right">
                          Requests
                        </th>
                        <th className="pb-3 pr-4 font-medium text-right">
                          Share
                        </th>
                        <th className="pb-3 pr-4 font-medium text-right">
                          Tokens
                        </th>
                        <th className="pb-3 font-medium text-right">
                          Tokens / req
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {endpointRows.slice(0, 7).map((row) => (
                        <tr
                          key={row.endpoint}
                          className="border-t border-white/8"
                        >
                          <td className="py-4 pr-4">
                            <div className="font-medium text-white">
                              {humanizeEndpoint(row.endpoint)}
                            </div>
                            <div className="mt-2 h-1.5 rounded-full bg-white/8">
                              <div
                                className="h-1.5 rounded-full bg-gradient-to-r from-stone-600 to-stone-200"
                                style={{
                                  width: `${Math.max(8, row.share * 100)}%`,
                                }}
                              />
                            </div>
                          </td>
                          <td className="py-4 pr-4 text-right text-white/80">
                            {formatInteger(row.requestCount)}
                          </td>
                          <td className="py-4 pr-4 text-right text-white/80">
                            {Math.round(row.share * 100)}%
                          </td>
                          <td className="py-4 pr-4 text-right text-white/80">
                            {formatCompact(row.tokens)}
                          </td>
                          <td className="py-4 text-right text-white/80">
                            {formatInteger(row.tokensPerRequest)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="rounded-[22px] border border-dashed border-white/10 px-4 py-10 text-center text-sm text-white/52">
                  No endpoint traffic has been recorded yet.
                </div>
              )}
            </SectionCard>

            <SectionCard
              title="Noisy logs"
              subtitle="Grouped by context so the loudest components surface first. Useful for deciding where to inspect before drift gets blamed on the model."
            >
              <div className="space-y-3">
                {noisyContexts.length > 0 ? (
                  noisyContexts.map((context) => (
                    <div
                      key={context.context}
                      className="rounded-[22px] border border-white/10 bg-white/6 px-4 py-4"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-white">
                            {context.context}
                          </div>
                          <div className="mt-2 text-sm leading-6 text-white/62">
                            {context.lastMessage}
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="text-sm font-medium text-stone-700">
                            Score {context.score.toFixed(1)}
                          </div>
                          <div className="mt-1 text-xs text-white/45">
                            {formatTime(context.lastTimestamp)}
                          </div>
                        </div>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2 text-xs">
                        <span className="rounded-full border border-white/10 bg-black/10 px-3 py-1 text-white/70">
                          {context.entries} entries
                        </span>
                        <span className="rounded-full border border-rose-200/20 bg-rose-300/10 px-3 py-1 text-rose-100">
                          {context.errors} errors
                        </span>
                        <span className="rounded-full border border-stone-300/35 bg-stone-200/45 px-3 py-1 text-stone-700">
                          {context.warns} warnings
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-[22px] border border-dashed border-white/10 px-4 py-10 text-center text-sm text-white/52">
                    No buffered logs yet.
                  </div>
                )}
              </div>
            </SectionCard>
          </div>

          <SectionCard
            title="Recent log stream"
            subtitle="Filter the live buffer by severity or search by context/message. This is where you confirm whether an issue is isolated or systemic."
            rightSlot={
              <div className="flex flex-wrap gap-2">
                {(["all", "error", "warn", "info", "debug"] as const).map(
                  (level) => (
                    <button
                      key={level}
                      type="button"
                      onClick={() => setActiveLevel(level)}
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                        activeLevel === level
                          ? "border-stone-300/45 bg-stone-200/45 text-stone-800"
                          : "border-white/10 bg-white/5 text-white/60 hover:text-white"
                      }`}
                    >
                      {level} ({levelCounts[level]})
                    </button>
                  ),
                )}
              </div>
            }
          >
            <div className="space-y-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-[18px] border border-white/10 bg-white/6 px-3 py-3">
                    <div className="text-[11px] uppercase tracking-[0.22em] text-white/42">
                      Errors
                    </div>
                    <div className="mt-1 text-xl font-semibold text-white">
                      {levelCounts.error}
                    </div>
                  </div>
                  <div className="rounded-[18px] border border-white/10 bg-white/6 px-3 py-3">
                    <div className="text-[11px] uppercase tracking-[0.22em] text-white/42">
                      Warnings
                    </div>
                    <div className="mt-1 text-xl font-semibold text-white">
                      {levelCounts.warn}
                    </div>
                  </div>
                  <div className="rounded-[18px] border border-white/10 bg-white/6 px-3 py-3">
                    <div className="text-[11px] uppercase tracking-[0.22em] text-white/42">
                      Info
                    </div>
                    <div className="mt-1 text-xl font-semibold text-white">
                      {levelCounts.info}
                    </div>
                  </div>
                  <div className="rounded-[18px] border border-white/10 bg-white/6 px-3 py-3">
                    <div className="text-[11px] uppercase tracking-[0.22em] text-white/42">
                      Debug
                    </div>
                    <div className="mt-1 text-xl font-semibold text-white">
                      {levelCounts.debug}
                    </div>
                  </div>
                </div>

                <label className="block w-full max-w-sm">
                  <span className="sr-only">Search logs</span>
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder="Search context or message"
                    className="w-full rounded-full border border-white/10 bg-black/15 px-4 py-2.5 text-sm text-white placeholder:text-white/35 focus:border-stone-300/45 focus:outline-none"
                  />
                </label>
              </div>

              <div className="space-y-3">
                {filteredLogs.length > 0 ? (
                  filteredLogs.slice(0, 12).map((log) => (
                    <div
                      key={`${log.timestamp}-${log.context}-${log.message}`}
                      className="rounded-[22px] border border-white/10 bg-white/6 px-4 py-4"
                    >
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${
                                log.level === "error"
                                  ? "border-rose-200/25 bg-rose-300/10 text-rose-100"
                                  : log.level === "warn"
                                    ? "border-stone-300/35 bg-stone-200/45 text-stone-700"
                                    : log.level === "info"
                                      ? "border-white/12 bg-white/6 text-white/72"
                                      : "border-white/10 bg-black/10 text-white/55"
                              }`}
                            >
                              {log.level}
                            </span>
                            <span className="truncate text-sm font-medium text-white">
                              {log.context}
                            </span>
                          </div>
                          <p className="mt-3 text-sm leading-6 text-white/68">
                            {log.message}
                          </p>
                        </div>
                        <div className="shrink-0 text-sm text-white/42">
                          {formatDateTime(log.timestamp)}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-[22px] border border-dashed border-white/10 px-4 py-10 text-center text-sm text-white/52">
                    No logs match the current filter.
                  </div>
                )}
              </div>
            </div>
          </SectionCard>

          {metrics.extraction.recent.length > 0 ? (
            <SectionCard
              title="Recent extraction passes"
              subtitle="A low-priority operational view that still helps explain sudden character or story-bible changes."
            >
              <div className="grid gap-3 lg:grid-cols-5">
                {metrics.extraction.recent
                  .slice()
                  .reverse()
                  .map((run) => (
                    <div
                      key={run.timestamp}
                      className="rounded-[22px] border border-white/10 bg-white/6 px-4 py-4"
                    >
                      <div className="text-sm font-semibold text-white">
                        {formatDateTime(run.timestamp)}
                      </div>
                      <div className="mt-3 space-y-2 text-sm text-white/64">
                        <div className="flex items-center justify-between gap-3">
                          <span>Passes</span>
                          <span className="font-medium text-white">
                            {run.passesRun}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span>Found</span>
                          <span className="font-medium text-white">
                            {run.charactersFound}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span>New</span>
                          <span className="font-medium text-stone-700">
                            {run.newAdded}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span>Enriched</span>
                          <span className="font-medium text-white">
                            {run.enriched}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </SectionCard>
          ) : null}
        </div>
      </div>
    </div>
  );
}
