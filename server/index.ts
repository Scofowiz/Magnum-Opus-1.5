import "dotenv/config";
import express, { Request, Response } from "express";
import OpenAI from "openai";
import Groq from "groq-sdk";
import fs from "fs";
import path from "path";
import { convert as htmlToPlainText } from "html-to-text";
import { CONFIG, TOKEN_LIMITS } from "./src/core/config.js";
import {
  createLogger,
  initializeLogger,
  sanitizeForLogging,
} from "./src/core/logger.js";
import { configureApp } from "./src/http/configureApp.js";
import {
  initializeMetrics,
  trackExtraction,
  trackLatency,
  trackQualityScore,
  trackRequest,
  trackTokens,
} from "./src/core/metrics.js";
import type {
  MetricsData,
  ProviderConfig,
  ProviderType,
} from "./src/core/types.js";
import {
  initializePersistence,
  loadData,
  saveData,
} from "./src/infrastructure/persistence.js";
import { registerObservabilityRoutes } from "./src/routes/observability.js";
import { registerProviderRoutes } from "./src/routes/provider.js";
import { registerGenerationRoutes } from "./src/routes/generation.js";
import { registerProjectRoutes } from "./src/routes/projects.js";
import { registerStoryBibleRoutes } from "./src/routes/storyBible.js";
import { registerAutonomousRoutes } from "./src/routes/autonomous.js";
import { registerAuthorExportRoutes } from "./src/routes/authorExport.js";
import {
  chatCompletionViaCodex,
  getCodexAuthStatus,
} from "./src/providers/codexCli.js";
import { buildCuratedPrompt } from "./src/prompt/curatedPromptBuilder.js";
import { createNarrativeService } from "./src/services/autonomous/narrative.js";
import {
  buildFourLayerMemorySummary,
  deriveLifetimeInsights,
  hydrateLifetimeMemory,
  recordProjectPreference,
  selectRelevantProjectMemory,
} from "./src/services/memory/fourLayerMemory.js";
import {
  mergePreferencesFromPayload,
  serializePreferencesForClient,
} from "./src/services/preferences/flatPreferences.js";
import {
  resolveChapterNumberForChapter,
  resolveChapterOutlineForChapter,
} from "./src/services/projects/chapterOutline.js";
import { learnFromFeedback } from "./sona-learning.js";
import { extractJSON } from "./src/utils/extractJson.js";
import type {
  AutonomousSession,
  CacheEntry,
  Character,
  ChapterOutline,
  ContextWindow,
  ContinuityIndex,
  ContinuityViolation,
  CraftPattern,
  LifetimeMemory,
  Location,
  PassResult,
  Project,
  SceneEvidence,
  SceneObjective,
  ScenePromptPlanRecord,
  StyleFingerprint,
  StoryBible,
  UserPreferences,
} from "./src/domain/types.js";
import * as db from "./db.js";

const app = express();
configureApp(app);

function registerProductionClient(app: express.Express): void {
  if (process.env.NODE_ENV !== "production") {
    return;
  }

  const clientDistDir = path.join(process.cwd(), "dist", "client");
  const clientIndexPath = path.join(clientDistDir, "index.html");

  if (!fs.existsSync(clientIndexPath)) {
    console.warn(
      `Production client build not found at ${clientIndexPath}. Run "npm run build" before starting production mode.`,
    );
    return;
  }

  app.use(
    express.static(clientDistDir, {
      index: false,
      setHeaders: (res, filePath) => {
        if (filePath.endsWith(".html")) {
          res.setHeader("Cache-Control", "no-cache");
          return;
        }

        if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        }
      },
    }),
  );

  app.get("*", (req: Request, res: Response, next) => {
    if (req.path === "/health" || req.path.startsWith("/api/")) {
      next();
      return;
    }

    if (path.extname(req.path)) {
      next();
      return;
    }

    if (!req.accepts("html")) {
      next();
      return;
    }

    res.sendFile(clientIndexPath);
  });
}

type ProviderPreference = "main" | ProviderType;

interface ChatCompletionEnvelope {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  };
}

interface ContinuityCheckResult {
  issues: Array<{
    type: string;
    description: string;
    severity: string;
    fixable: "text" | "bible" | "author";
  }>;
  score: number;
}

interface QualityScoreResult {
  score: number;
  breakdown: Record<string, number>;
  feedback: string;
  violations?: string[];
}

interface RichStyleAnalysis {
  showVsTellRatio?: number;
  metaphorFrequency?: number;
  tone?: string;
  strengths?: string[];
  improvements?: string[];
  signaturePhrases?: string[];
  dialogueTags?: {
    preferred?: string[];
    avoided?: string[];
  };
  verbChoices?: {
    movement?: string[];
    speech?: string[];
    emotion?: string[];
  };
  sentencePatterns?: string[];
  sceneOpenings?: string[];
  tensionTechniques?: string[];
  exemplars?: string[];
  humorStyle?: string;
  emotionalPalette?: string[];
  proseTechniques?: string[];
  pacing?: string;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "object" && error !== null) {
    const record = error as {
      message?: unknown;
      error?: { message?: unknown };
    };
    if (typeof record.message === "string" && record.message.length > 0) {
      return record.message;
    }
    if (
      typeof record.error?.message === "string" &&
      record.error.message.length > 0
    ) {
      return record.error.message;
    }
  }

  return String(error);
}

// ============================================================================
// DATABASE - File-based persistence (must be first for provider config)
// ============================================================================

const DATA_DIR = path.join(process.cwd(), ".novawrite-data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const LOGS_DIR = path.join(DATA_DIR, "logs");
if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });
const DRAFTS_DIR = path.join(DATA_DIR, "drafts");
if (!fs.existsSync(DRAFTS_DIR)) fs.mkdirSync(DRAFTS_DIR, { recursive: true });
const defaultMetrics: MetricsData = {
  tokenUsage: { total: 0, byEndpoint: {}, byDay: {} },
  qualityScores: { history: [] },
  latency: { requests: [] },
  extraction: { iterations: [] },
  requestCounts: {},
  startedAt: new Date().toISOString(),
};

initializePersistence(DATA_DIR);
initializeLogger(LOGS_DIR);

const logger = createLogger("server");

initializeMetrics(loadData("metrics.json", defaultMetrics), (snapshot) => {
  saveData("metrics.json", snapshot);
});

function normalizeOllamaApiBaseUrl(baseUrl?: string): string {
  const candidate = (baseUrl || "http://localhost:11434")
    .trim()
    .replace(/\/+$/, "");
  return candidate.endsWith("/v1") ? candidate : `${candidate}/v1`;
}

// Get provider config from environment or settings
// PRIORITY ORDER:
// 1. Saved UI config (user's explicit choice persists across restarts)
// 2. Explicit AI_PROVIDER + AI_MODEL env vars
// 3. Auto-detect from AI_MODEL name
// 4. Any available API key
type ProviderProfiles = Partial<Record<ProviderType, ProviderConfig>>;

function loadProviderProfiles(): ProviderProfiles {
  return loadData<ProviderProfiles>("provider-profiles.json", {});
}

function saveProviderProfile(config: ProviderConfig): void {
  const profiles = loadProviderProfiles();
  profiles[config.type] = config;
  saveData("provider-profiles.json", profiles);
}

function applyImplicitProviderSettings(config: ProviderConfig): ProviderConfig {
  const normalized: ProviderConfig = {
    ...config,
  };

  if (normalized.type === "ollama") {
    normalized.apiKey = "ollama";
    normalized.baseUrl = normalizeOllamaApiBaseUrl(normalized.baseUrl);
  }

  if (normalized.type === "codex") {
    normalized.apiKey = "chatgpt";
    normalized.baseUrl = undefined;
  }

  if (normalized.type === "openai-compatible" && !normalized.baseUrl) {
    normalized.baseUrl =
      process.env.OPENAI_COMPATIBLE_BASE_URL || "http://localhost:11434/v1";
  }

  return normalized;
}

function hydrateProviderConfig(config: ProviderConfig): ProviderConfig {
  const savedProfile = loadProviderProfiles()[config.type];
  return applyImplicitProviderSettings({
    ...savedProfile,
    ...config,
    apiKey: config.apiKey || savedProfile?.apiKey || "",
    baseUrl: config.baseUrl || savedProfile?.baseUrl,
    model: config.model || savedProfile?.model || "",
  });
}

function getProviderConfig(): ProviderConfig {
  // FIRST: Check saved preferences from UI - this is the user's explicit choice
  const savedConfig = loadData<ProviderConfig | null>(
    "provider-config.json",
    null,
  );
  if (savedConfig) {
    const hydrated = hydrateProviderConfig(savedConfig);
    if (hydrated.model && hydrated.apiKey) {
      return hydrated;
    }
  }

  const model = process.env.AI_MODEL;
  const explicitProvider = process.env.AI_PROVIDER as ProviderType | undefined;

  // SECOND: If explicit provider is set via env, use that
  if (explicitProvider && model) {
    if (explicitProvider === "ollama") {
      return applyImplicitProviderSettings({
        type: explicitProvider,
        apiKey: "",
        baseUrl:
          process.env.OLLAMA_BASE_URL || process.env.OPENAI_COMPATIBLE_BASE_URL,
        model,
      });
    }

    const keyMap: Record<string, string | undefined> = {
      codex: "chatgpt",
      groq: process.env.GROQ_API_KEY,
      google: process.env.GOOGLE_API_KEY,
      openai: process.env.OPENAI_API_KEY,
      anthropic: process.env.ANTHROPIC_API_KEY,
      "openai-compatible": process.env.OPENAI_COMPATIBLE_API_KEY,
    };
    const apiKey = keyMap[explicitProvider];
    if (apiKey) {
      return applyImplicitProviderSettings({
        type: explicitProvider,
        apiKey,
        baseUrl:
          explicitProvider === "openai-compatible"
            ? process.env.OPENAI_COMPATIBLE_BASE_URL ||
              "http://localhost:11434/v1"
            : undefined,
        model,
      });
    }
  }

  // THIRD: Auto-detect provider based on model name if AI_MODEL is set
  if (model) {
    // Gemini models start with "gemini-"
    if (model.startsWith("gemini-") && process.env.GOOGLE_API_KEY) {
      return { type: "google", apiKey: process.env.GOOGLE_API_KEY, model };
    }
    // Groq-hosted models (llama, mixtral, etc.) or models with org prefix
    if (
      process.env.GROQ_API_KEY &&
      (model.includes("llama") ||
        model.includes("mixtral") ||
        model.includes("/") || // org/model format like moonshotai/kimi
        model.startsWith("llama"))
    ) {
      return { type: "groq", apiKey: process.env.GROQ_API_KEY, model };
    }
    // GPT models
    if (model.startsWith("gpt-") && process.env.OPENAI_API_KEY) {
      return { type: "openai", apiKey: process.env.OPENAI_API_KEY, model };
    }
    // Claude models
    if (model.startsWith("claude-") && process.env.ANTHROPIC_API_KEY) {
      return {
        type: "anthropic",
        apiKey: process.env.ANTHROPIC_API_KEY,
        model,
      };
    }
  }

  // FOURTH: Try any available key
  if (process.env.GROQ_API_KEY)
    return {
      type: "groq",
      apiKey: process.env.GROQ_API_KEY,
      model: model || "",
    };
  if (process.env.GOOGLE_API_KEY)
    return {
      type: "google",
      apiKey: process.env.GOOGLE_API_KEY,
      model: model || "",
    };
  if (process.env.OPENAI_API_KEY)
    return {
      type: "openai",
      apiKey: process.env.OPENAI_API_KEY,
      model: model || "",
    };
  if (process.env.ANTHROPIC_API_KEY)
    return {
      type: "anthropic",
      apiKey: process.env.ANTHROPIC_API_KEY,
      model: model || "",
    };

  // No valid configuration found
  return {
    type: "groq",
    apiKey: "",
    model: "",
  };
}

let providerConfig = getProviderConfig();
saveProviderProfile(providerConfig);

function saveProviderConfig(config: ProviderConfig): void {
  const hydrated = hydrateProviderConfig(config);
  providerConfig = hydrated;
  saveData("provider-config.json", hydrated);
  saveProviderProfile(hydrated);
}

function getCurrentProviderConfig(): ProviderConfig {
  return providerConfig;
}

function getEnvProviderDefaults(type: ProviderType): Partial<ProviderConfig> {
  switch (type) {
    case "groq":
      return { apiKey: process.env.GROQ_API_KEY || "" };
    case "google":
      return { apiKey: process.env.GOOGLE_API_KEY || "" };
    case "openai":
      return { apiKey: process.env.OPENAI_API_KEY || "" };
    case "anthropic":
      return { apiKey: process.env.ANTHROPIC_API_KEY || "" };
    case "openai-compatible":
      return {
        apiKey: process.env.OPENAI_COMPATIBLE_API_KEY || "",
        baseUrl:
          process.env.OPENAI_COMPATIBLE_BASE_URL || "http://localhost:11434/v1",
      };
    case "ollama":
      return { apiKey: "ollama", baseUrl: "http://localhost:11434/v1" };
    case "codex":
      return { apiKey: "chatgpt" };
    default:
      return {};
  }
}

function resolveProviderForType(
  type: ProviderType,
  overrides: Partial<ProviderConfig> = {},
): ProviderConfig {
  const savedProfile = loadProviderProfiles()[type];
  const envDefaults = getEnvProviderDefaults(type);
  const resolved: ProviderConfig = {
    type,
    apiKey: "",
    model: "",
    ...envDefaults,
    ...savedProfile,
    ...overrides,
  };

  if (type === "ollama") {
    resolved.apiKey = "ollama";
    resolved.baseUrl = normalizeOllamaApiBaseUrl(resolved.baseUrl);
  }

  if (type === "codex") {
    resolved.apiKey = "chatgpt";
  }

  return resolved;
}

function resolveProviderPreference(
  choice: ProviderPreference | undefined,
  overrides: Partial<ProviderConfig> = {},
): ProviderConfig {
  if (!choice || choice === "main") {
    return {
      ...providerConfig,
      ...overrides,
      type: providerConfig.type,
      baseUrl:
        providerConfig.type === "ollama"
          ? normalizeOllamaApiBaseUrl(
              overrides.baseUrl || providerConfig.baseUrl,
            )
          : overrides.baseUrl || providerConfig.baseUrl,
    };
  }

  return resolveProviderForType(choice, overrides);
}

// Unified chat completion across providers
async function chatCompletion(
  systemPrompt: string,
  userMessage: string,
  options: {
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    frequencyPenalty?: number;
    presencePenalty?: number;
    signal?: AbortSignal;
    model?: string;
    provider?: ProviderConfig;
  } = {},
): Promise<{ text: string; tokens: number }> {
  const temperature = options.temperature ?? 0.7;
  const maxTokens = options.maxTokens ?? 16000; // Default, but callers should specify
  const topP = options.topP ?? 0.95; // Nucleus sampling - 0.9 good for creative writing
  const frequencyPenalty = options.frequencyPenalty;
  const presencePenalty = options.presencePenalty;
  const signal = options.signal;
  const activeProvider = options.provider || providerConfig;
  const model = options.model || activeProvider.model;

  // Helper to race a provider promise against abort signal
  const wrapWithAbort = async <T>(p: Promise<T>): Promise<T> => {
    if (!signal) return p;
    return await Promise.race([
      p,
      new Promise<T>((_, reject) => {
        signal.addEventListener("abort", () => reject(new Error("Aborted")));
      }),
    ]);
  };

  if (!activeProvider.apiKey) {
    if (activeProvider.type !== "codex") {
      throw new Error(
        "No API key configured. Set GROQ_API_KEY, OPENAI_API_KEY, or configure via /api/provider",
      );
    }
  }

  if (!model) {
    throw new Error(
      "No model configured. Set AI_MODEL in .env or configure via Settings",
    );
  }

  if (activeProvider.type === "codex") {
    return await wrapWithAbort(
      chatCompletionViaCodex({
        systemPrompt,
        userMessage,
        model,
        signal,
      }),
    );
  }

  if (activeProvider.type === "groq") {
    const groq = new Groq({ apiKey: activeProvider.apiKey });
    const makeGroqRequest = (tokens: number): Promise<ChatCompletionEnvelope> =>
      groq.chat.completions.create({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        temperature,
        max_tokens: tokens,
        top_p: topP,
        ...(typeof frequencyPenalty === "number"
          ? { frequency_penalty: frequencyPenalty }
          : {}),
        ...(typeof presencePenalty === "number"
          ? { presence_penalty: presencePenalty }
          : {}),
      }) as Promise<ChatCompletionEnvelope>;
    let response: ChatCompletionEnvelope;
    try {
      response = await wrapWithAbort(makeGroqRequest(maxTokens));
    } catch (error) {
      const msg = getErrorMessage(error);
      const match = msg.match(/less than or equal to `(\d+)`/);
      if (match) {
        const modelLimit = parseInt(match[1]);
        response = await wrapWithAbort(makeGroqRequest(modelLimit));
      } else {
        throw error;
      }
    }
    const text = response.choices?.[0]?.message?.content || "";
    const tokens =
      (response.usage?.prompt_tokens || 0) +
      (response.usage?.completion_tokens || 0);
    return { text, tokens };
  }

  if (
    activeProvider.type === "openai" ||
    activeProvider.type === "openai-compatible"
  ) {
    const openai = new OpenAI({
      apiKey: activeProvider.apiKey,
      baseURL: activeProvider.baseUrl,
    });
    const response = await wrapWithAbort(
      // OpenAI SDK doesn't accept AbortSignal reliably here; wrap with race
      openai.chat.completions.create({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        temperature,
        max_tokens: maxTokens,
        top_p: topP,
        ...(typeof frequencyPenalty === "number"
          ? { frequency_penalty: frequencyPenalty }
          : {}),
        ...(typeof presencePenalty === "number"
          ? { presence_penalty: presencePenalty }
          : {}),
      }),
    );
    const text = response.choices[0]?.message?.content || "";
    const tokens =
      (response.usage?.prompt_tokens || 0) +
      (response.usage?.completion_tokens || 0);
    return { text, tokens };
  }

  // Ollama (local) - uses OpenAI-compatible API
  if (activeProvider.type === "ollama") {
    const openai = new OpenAI({
      apiKey: "ollama", // Ollama doesn't need a real key
      baseURL: normalizeOllamaApiBaseUrl(activeProvider.baseUrl),
    });
    const response = await openai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature,
      max_tokens: maxTokens,
      top_p: topP,
      ...(typeof frequencyPenalty === "number"
        ? { frequency_penalty: frequencyPenalty }
        : {}),
      ...(typeof presencePenalty === "number"
        ? { presence_penalty: presencePenalty }
        : {}),
    });
    const text = response.choices[0]?.message?.content || "";
    const tokens =
      (response.usage?.prompt_tokens || 0) +
      (response.usage?.completion_tokens || 0);
    return { text, tokens };
  }

  // Google Gemini - uses OpenAI-compatible API via Google's endpoint
  if (activeProvider.type === "google") {
    const response = await wrapWithAbort(
      fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${activeProvider.apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                role: "user",
                parts: [{ text: `${systemPrompt}\n\n${userMessage}` }],
              },
            ],
            generationConfig: {
              temperature,
              maxOutputTokens: maxTokens,
              topP,
              ...(typeof frequencyPenalty === "number"
                ? { frequencyPenalty }
                : {}),
              ...(typeof presencePenalty === "number"
                ? { presencePenalty }
                : {}),
            },
          }),
        },
      ),
    );
    const data = await response.json();
    if (data.error) {
      throw new Error(data.error.message || JSON.stringify(data.error));
    }
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const tokens = data.usageMetadata?.totalTokenCount || 0;
    return { text, tokens };
  }

  // Anthropic Claude - direct API
  if (activeProvider.type === "anthropic") {
    const response = await wrapWithAbort(
      fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": activeProvider.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          system: systemPrompt,
          messages: [{ role: "user", content: userMessage }],
          temperature,
        }),
      }),
    );
    const data = await response.json();
    if (data.error) {
      throw new Error(data.error.message || JSON.stringify(data.error));
    }
    const text = data.content?.[0]?.text || "";
    const tokens =
      (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0);
    return { text, tokens };
  }

  throw new Error(`Unsupported provider: ${activeProvider.type}`);
}

// Cache stores
const caches = {
  storyBible: new Map<string, CacheEntry<string>>(), // projectId -> serialized bible
  narrativeState: new Map<string, CacheEntry<Record<string, unknown>>>(), // chapterId -> state
  qualityScores: new Map<
    string,
    CacheEntry<ContinuityCheckResult | QualityScoreResult>
  >(), // contentHash -> score
  continuityIndex: new Map<string, ContinuityIndex>(), // projectId -> index
  styleAnalysis: new Map<string, CacheEntry<Partial<StyleFingerprint>>>(), // sampleHash -> analysis
  promptEmbeddings: new Map<string, CacheEntry<number[]>>(), // model+text hash -> embedding vector
};

function hashContent(content: string): string {
  // Simple hash for cache invalidation
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return hash.toString(36);
}

function tokenizeForSimilarity(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 2),
  );
}

function lexicalSimilarity(a: string, b: string): number {
  const ta = tokenizeForSimilarity(a);
  const tb = tokenizeForSimilarity(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let overlap = 0;
  for (const t of ta) if (tb.has(t)) overlap++;
  return overlap / Math.max(ta.size, tb.size);
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (!a.length || !b.length || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 0;
  return dot / denom;
}

function normalizeObjectives(sceneGoal: string): string[] {
  const parts = sceneGoal
    .split(/\n|;|,|\band\b/gi)
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length === 0) return [sceneGoal.trim()].filter(Boolean);
  return parts.slice(0, 8);
}

function collectSceneEvidence(
  project: Project,
  chapterId: string | undefined,
  contextBefore: string,
  contextAfter: string,
): Array<{ id: string; source: string; text: string }> {
  const out: Array<{ id: string; source: string; text: string }> = [];
  const sb = project.storyBible;

  const push = (source: string, text: string): void => {
    const clean = text.replace(/\s+/g, " ").trim();
    if (!clean) return;
    out.push({ id: crypto.randomUUID(), source, text: clean.slice(0, 600) });
  };

  if (sb?.premise?.logline) push("story.premise.logline", sb.premise.logline);
  if (sb?.premise?.synopsis)
    push("story.premise.synopsis", sb.premise.synopsis);
  for (const theme of sb?.premise?.themes || []) push("story.theme", theme);
  const chapter = project.chapters.find((c) => c.id === chapterId);
  const activeChapterNumber =
    resolveChapterNumberForChapter(chapter, sb?.chapterOutlines) || null;
  for (const char of sb?.characters || []) {
    if (char.unrevealed) continue;
    push(
      `character.${char.name}.description`,
      `${char.name}: ${char.description || ""}`,
    );
    if (char.motivation)
      push(
        `character.${char.name}.motivation`,
        `${char.name} motivation: ${char.motivation}`,
      );
    if (char.voice?.speechPatterns?.length) {
      push(
        `character.${char.name}.voice`,
        `${char.name} voice patterns: ${char.voice.speechPatterns.join(", ")}`,
      );
    }
  }
  for (const rule of sb?.world?.rules || []) push("world.rule", rule);
  for (const location of sb?.world?.locations || []) {
    push(
      `world.location.${location.name}`,
      `${location.name}: ${location.description || ""}`,
    );
  }
  for (const thread of sb?.plotStructure?.plotThreads || []) {
    const introducedIn = thread.introducedIn;
    const resolvedIn = thread.resolvedIn;
    if (
      activeChapterNumber &&
      introducedIn &&
      introducedIn > activeChapterNumber
    )
      continue;
    if (activeChapterNumber && resolvedIn && resolvedIn < activeChapterNumber)
      continue;
    const threadDetails = thread.description || "";
    push(`plot.thread.${thread.name}`, `${thread.name}: ${threadDetails}`);
  }
  if (chapter) {
    push(
      `chapter.${activeChapterNumber || chapter.order + 1}.title`,
      chapter.title,
    );
    const plainChapterText = htmlToPlainText(chapter.content || "");
    if (plainChapterText) {
      push(
        `chapter.${activeChapterNumber || chapter.order + 1}.tail`,
        plainChapterText.slice(-1200),
      );
    }
  }
  const outlinesInScope = activeChapterNumber
    ? (sb?.chapterOutlines || []).filter(
        (outline) => outline.chapterNumber === activeChapterNumber,
      )
    : sb?.chapterOutlines || [];
  for (const outline of outlinesInScope) {
    push(
      `outline.chapter.${outline.chapterNumber}`,
      `${outline.title}: ${outline.summary || ""}`,
    );
    for (const beat of outline.beats || []) {
      push(`outline.chapter.${outline.chapterNumber}.beat`, beat);
    }
  }

  if (contextBefore) push("cursor.before", contextBefore.slice(-1500));
  if (contextAfter) push("cursor.after", contextAfter.slice(0, 1200));

  return out;
}

async function getEmbeddingVector(
  text: string,
  provider: ProviderConfig | null,
): Promise<number[] | null> {
  const model = provider?.model || "";
  if (!provider || !model || !text.trim()) return null;
  const cacheKey = `${provider.type}:${provider.baseUrl || ""}:${model}:${hashContent(text)}`;
  const cached = caches.promptEmbeddings.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CONFIG.STYLE_CACHE_TTL_MS) {
    return cached.data;
  }

  const providerUsesOpenAIEmbeddings =
    provider.type === "openai" ||
    provider.type === "openai-compatible" ||
    provider.type === "ollama";

  if (!providerUsesOpenAIEmbeddings) return null;

  try {
    const openai = new OpenAI({
      apiKey: provider.type === "ollama" ? "ollama" : provider.apiKey,
      baseURL:
        provider.type === "ollama"
          ? normalizeOllamaApiBaseUrl(provider.baseUrl)
          : provider.baseUrl,
    });

    const response = await openai.embeddings.create({
      model,
      input: text.slice(0, 8000),
    });

    const vector = response.data?.[0]?.embedding;
    if (!Array.isArray(vector) || vector.length === 0) return null;

    caches.promptEmbeddings.set(cacheKey, {
      data: vector,
      timestamp: Date.now(),
      hash: cacheKey,
    });

    return vector;
  } catch (e) {
    logger.warn("Embedding lookup failed; falling back to lexical ranking", {
      model,
      error: String(e),
    });
    return null;
  }
}

async function rankEvidenceForObjective(
  objective: string,
  evidence: Array<{ id: string; source: string; text: string }>,
  embeddingProvider: ProviderConfig | null,
  topK: number,
): Promise<SceneEvidence[]> {
  const maxK = Math.max(3, Math.min(20, topK || 12));
  const objectiveVector = embeddingProvider
    ? await getEmbeddingVector(objective, embeddingProvider)
    : null;

  const scored: SceneEvidence[] = [];
  for (const item of evidence) {
    let score = lexicalSimilarity(objective, item.text);
    if (objectiveVector) {
      const itemVec = await getEmbeddingVector(item.text, embeddingProvider);
      if (itemVec) {
        score =
          0.15 * score + 0.75 * cosineSimilarity(objectiveVector, itemVec);
      }
    }
    scored.push({
      id: item.id,
      source: item.source,
      text: item.text,
      score,
    });
  }

  return scored.sort((a, b) => b.score - a.score).slice(0, maxK);
}

async function maybeRefineDirectiveWithPlannerModel(
  sceneGoal: string,
  objectives: string[],
  evidence: SceneEvidence[],
  plannerProvider: ProviderConfig | null,
  fallbackMode: "lexical" | "error",
): Promise<string | null> {
  const plannerModel = plannerProvider?.model || "";
  if (!plannerModel) return null;
  try {
    const objectiveLines = objectives
      .map((o, i) => `${i + 1}. ${o}`)
      .join("\n");
    const evidenceLines = evidence
      .slice(0, 12)
      .map((e) => `- [${e.source}] ${e.text}`)
      .join("\n");

    const { text } = await chatCompletion(
      "You are a scene prompt planner. Build a concise execution brief that helps a writer model hit exact scene intent. Output plain text only.",
      `Scene goal:\n${sceneGoal}\n\nObjectives:\n${objectiveLines}\n\nEvidence:\n${evidenceLines}\n\nProduce this structure exactly:\nSCENE_INTENT\nMUST_INCLUDE\nCONTINUITY_ANCHORS\nAVOID\nSUCCESS_CHECKS\n\nEach section must use short bullets.`,
      {
        temperature: 0.5,
        topP: 0.8,
        maxTokens: 1800,
        model: plannerModel,
        provider: plannerProvider || undefined,
      },
    );

    const cleaned = text.trim();
    return cleaned.length > 0 ? cleaned : null;
  } catch (e) {
    logger.warn(
      "Planner model refinement failed; using deterministic directive",
      {
        plannerModel,
        error: String(e),
      },
    );
    if (fallbackMode === "error") {
      throw new Error("PROMPT_PLANNER_MODEL_UNAVAILABLE");
    }
    return null;
  }
}

async function buildScenePromptPlan(
  project: Project,
  chapterId: string | undefined,
  sceneGoal: string,
  contextBefore: string,
  contextAfter: string,
): Promise<ScenePromptPlanRecord | null> {
  const cleanGoal = sceneGoal.trim();
  if (!cleanGoal) return null;

  const objectives = normalizeObjectives(cleanGoal);
  const rawEvidence = collectSceneEvidence(
    project,
    chapterId,
    contextBefore,
    contextAfter,
  );
  if (rawEvidence.length === 0) return null;

  const embeddingModel =
    userPreferences.generationSettings.promptPlannerEmbeddingModel?.trim() ||
    "";
  const embeddingProviderChoice =
    userPreferences.generationSettings.promptPlannerEmbeddingProvider;
  const plannerModel =
    userPreferences.generationSettings.promptPlannerModel?.trim() || "";
  const plannerProviderChoice =
    userPreferences.generationSettings.promptPlannerProvider;
  const topK = userPreferences.generationSettings.promptPlannerTopK;
  const embeddingProvider = embeddingModel
    ? resolveProviderPreference(embeddingProviderChoice, {
        model: embeddingModel,
      })
    : null;
  const plannerProvider = plannerModel
    ? resolveProviderPreference(plannerProviderChoice, { model: plannerModel })
    : null;
  const fallbackMode =
    userPreferences.generationSettings.promptPlannerFallbackMode || "error";

  const aggregate = new Map<string, SceneEvidence>();
  const objectiveRecords: SceneObjective[] = [];

  let embeddingAvailable = true;
  if (embeddingProvider && embeddingModel && objectives.length > 0) {
    const probe = await getEmbeddingVector(objectives[0], embeddingProvider);
    embeddingAvailable = Boolean(probe);
    if (!embeddingAvailable && fallbackMode === "error") {
      throw new Error("PROMPT_PLANNER_EMBEDDING_UNAVAILABLE");
    }
  }

  const activeEmbeddingProvider =
    embeddingAvailable && embeddingProvider ? embeddingProvider : null;

  for (const objective of objectives) {
    const ranked = await rankEvidenceForObjective(
      objective,
      rawEvidence,
      activeEmbeddingProvider,
      topK,
    );
    for (const ev of ranked) {
      const existing = aggregate.get(ev.id);
      if (!existing || ev.score > existing.score) aggregate.set(ev.id, ev);
    }
    objectiveRecords.push({
      id: crypto.randomUUID(),
      text: objective,
      status: ranked.length > 0 ? "covered" : "pending",
      evidenceIds: ranked.slice(0, 3).map((r) => r.id),
    });
  }

  const selectedEvidence = Array.from(aggregate.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(5, Math.min(15, topK)));

  const deterministicDirective = [
    "SCENE_INTENT",
    ...objectives.map((o) => `- ${o}`),
    "",
    "MUST_INCLUDE",
    ...selectedEvidence.slice(0, 6).map((e) => `- ${e.text}`),
    "",
    "CONTINUITY_ANCHORS",
    ...selectedEvidence.slice(0, 4).map((e) => `- (${e.source}) ${e.text}`),
    "",
    "AVOID",
    "- Introducing new named entities unless required by explicit prompt intent",
    "- Contradicting established world rules, character motives, or chapter beats",
    "",
    "SUCCESS_CHECKS",
    "- Every objective is materially advanced in this continuation",
    "- Tone/POV/tense stay consistent with project directives",
    "- Scene can lead naturally into text-after-cursor when provided",
  ].join("\n");

  const refined = await maybeRefineDirectiveWithPlannerModel(
    cleanGoal,
    objectives,
    selectedEvidence,
    plannerProvider,
    fallbackMode,
  );

  const record: ScenePromptPlanRecord = {
    id: crypto.randomUUID(),
    projectId: project.id,
    chapterId,
    createdAt: new Date().toISOString(),
    sceneGoal: cleanGoal,
    objectives: objectiveRecords,
    selectedEvidence,
    directive: refined || deterministicDirective,
    plannerModelUsed: refined ? plannerModel : null,
    embeddingModelUsed: embeddingModel || null,
  };

  scenePromptPlans.push(record);
  persistScenePromptPlans();
  return record;
}

const defaultUserPreferences: UserPreferences = {
  styleFingerprint: null,
  generationSettings: {
    defaultTemperature: 0.8,
    defaultTopP: 0.75,
    defaultFrequencyPenalty: 0.85,
    defaultPresencePenalty: -0.2,
    defaultTargetWords: CONFIG.DEFAULT_TARGET_WORDS,
    enablePromptPlanner: true,
    promptPlannerEmbeddingProvider: "ollama",
    promptPlannerEmbeddingModel: "qwen3-embedding:0.6b",
    promptPlannerProvider: "ollama",
    promptPlannerModel: "qwen3:0.6b",
    storyBibleProvider: "main",
    storyBibleModel: "",
    promptPlannerTopK: 12,
    promptPlannerFallbackMode: "error",
  },
  memorySettings: {
    preferredPov: "third-limited",
    preferredTense: "past",
    contextWindowSize: 10000,
    enableContinuityChecks: true,
    persistentDirections: "",
  },
  qualitySettings: {
    showScores: true,
    minThreshold: 7,
  },
  uiPreferences: { theme: "light", fontSize: 16, showWordCount: true },
};

// Initialize data stores
const projects: Map<string, Project> = new Map(
  Object.entries(loadData("projects.json", {})),
);
const loadedPreferences = loadData<Partial<UserPreferences>>(
  "preferences.json",
  defaultUserPreferences,
);
const userPreferences: UserPreferences = {
  ...defaultUserPreferences,
  ...loadedPreferences,
  generationSettings: {
    ...defaultUserPreferences.generationSettings,
    ...(loadedPreferences.generationSettings || {}),
  },
  memorySettings: {
    ...defaultUserPreferences.memorySettings,
    ...(loadedPreferences.memorySettings || {}),
  },
  qualitySettings: {
    ...defaultUserPreferences.qualitySettings,
    ...(loadedPreferences.qualitySettings || {}),
  },
  uiPreferences: {
    ...defaultUserPreferences.uiPreferences,
    ...(loadedPreferences.uiPreferences || {}),
  },
};
let craftPatterns: CraftPattern[] = loadData("craft-patterns.json", []);
let lifetimeMemory: LifetimeMemory = hydrateLifetimeMemory(
  loadData("lifetime-memory.json", {
    insights: [],
    writingHistory: [],
    feedbackHistory: [],
    projectMemories: [],
  }),
);
let scenePromptPlans: ScenePromptPlanRecord[] = loadData(
  "scene-prompt-plans.json",
  [],
);

registerObservabilityRoutes(app, {
  getHealthSummary: () => ({
    provider: providerConfig.type,
    model: providerConfig.model,
    hasApiKey: !!providerConfig.apiKey,
    projectCount: projects.size,
    hasStyleFingerprint: !!userPreferences.styleFingerprint,
    craftPatternCount: craftPatterns.length,
  }),
  getProjects: () => projects,
  trackRequest,
});

function persistProjects(): void {
  saveData("projects.json", Object.fromEntries(projects));
}

// Draft persistence helpers
function draftPath(
  projectId: string,
  chapterId: string,
  sessionId: string,
): string {
  const safeProject = projectId.replace(/[^a-zA-Z0-9-_]/g, "_");
  const safeChapter = chapterId.replace(/[^a-zA-Z0-9-_]/g, "_");
  const filename = `${safeProject}__${safeChapter}__${sessionId}.html`;
  return path.join(DRAFTS_DIR, filename);
}

function _saveDraftToDisk(
  projectId: string,
  chapterId: string,
  sessionId: string,
  htmlContent: string,
): void {
  try {
    const p = draftPath(projectId, chapterId, sessionId);
    fs.writeFileSync(p, htmlContent, "utf-8");
    logger.info("Saved draft to disk", { path: p });
  } catch (e) {
    logger.error("Failed to save draft to disk", {
      error: String(e),
      projectId,
      chapterId,
      sessionId,
    });
  }
}

function _readDraftFromDisk(
  projectId: string,
  chapterId: string,
  sessionId: string,
): string | null {
  try {
    const p = draftPath(projectId, chapterId, sessionId);
    if (!fs.existsSync(p)) return null;
    return fs.readFileSync(p, "utf-8");
  } catch (e) {
    logger.error("Failed to read draft from disk", {
      error: String(e),
      projectId,
      chapterId,
      sessionId,
    });
    return null;
  }
}

function _deleteDraftFromDisk(
  projectId: string,
  chapterId: string,
  sessionId: string,
): void {
  try {
    const p = draftPath(projectId, chapterId, sessionId);
    if (fs.existsSync(p)) fs.unlinkSync(p);
    logger.info("Deleted draft from disk", { path: p });
  } catch (e) {
    logger.error("Failed to delete draft from disk", {
      error: String(e),
      projectId,
      chapterId,
      sessionId,
    });
  }
}

function persistPreferences(): void {
  saveData("preferences.json", userPreferences);
}

function persistCraftPatterns(): void {
  saveData("craft-patterns.json", craftPatterns);
}

function persistLifetimeMemory(): void {
  saveData("lifetime-memory.json", lifetimeMemory);
}

function refreshLifetimeInsights(): void {
  lifetimeMemory.insights = deriveLifetimeInsights(lifetimeMemory);
  persistLifetimeMemory();
}

function persistScenePromptPlans(): void {
  // Keep bounded history on disk
  if (scenePromptPlans.length > 1000) {
    scenePromptPlans = scenePromptPlans.slice(-1000);
  }
  saveData("scene-prompt-plans.json", scenePromptPlans);
}

// ============================================================================
// CACHING LAYER - Avoid redundant computation and API calls
// ============================================================================

// Get or build cached story bible serialization
function _getCachedStoryBible(project: Project): string | null {
  if (!project.storyBible) return null;

  const bibleString = JSON.stringify(project.storyBible);
  const currentHash = hashContent(bibleString);

  const cached = caches.storyBible.get(project.id);
  if (cached && cached.hash === currentHash) {
    logger.debug("Using cached story bible serialization");
    return cached.data;
  }

  // Build and cache the serialized version
  const sb = project.storyBible;
  const parts: string[] = [];

  if (sb.premise) {
    parts.push(`PREMISE: ${sb.premise.logline}`);
    if (sb.premise.synopsis) parts.push(`SYNOPSIS: ${sb.premise.synopsis}`);
    if (sb.premise.themes?.length)
      parts.push(`THEMES: ${sb.premise.themes.join(", ")}`);
    if (sb.premise.tone) parts.push(`TONE: ${sb.premise.tone}`);
  }

  if (sb.characters?.length) {
    parts.push(`\nCHARACTERS:`);
    for (const char of sb.characters) {
      parts.push(`- ${char.name} (${char.role}): ${char.description || ""}`);
      if (char.motivation) parts.push(`  Motivation: ${char.motivation}`);
      if (char.voice?.speechPatterns?.length)
        parts.push(`  Speech: ${char.voice.speechPatterns.join(", ")}`);
    }
  }

  if (sb.world) {
    parts.push(`\nWORLD: ${sb.world.setting || ""}`);
    if (sb.world.timePeriod) parts.push(`TIME: ${sb.world.timePeriod}`);
    if (sb.world.locations?.length) {
      parts.push(
        `LOCATIONS: ${sb.world.locations.map((l) => l.name).join(", ")}`,
      );
    }
  }

  if (sb.styleDirectives) {
    parts.push(
      `\nSTYLE: POV=${sb.styleDirectives.pov}, Tense=${sb.styleDirectives.tense}`,
    );
    if (sb.styleDirectives.proseStyle)
      parts.push(`Prose: ${sb.styleDirectives.proseStyle}`);
  }

  const serialized = parts.join("\n");

  caches.storyBible.set(project.id, {
    hash: currentHash,
    data: serialized,
    timestamp: Date.now(),
  });

  logger.info("Cached story bible serialization", {
    projectId: project.id,
    length: serialized.length,
  });
  return serialized;
}

// Build/update continuity index from project state
function updateContinuityIndex(project: Project): ContinuityIndex {
  const existing = caches.continuityIndex.get(project.id);
  const projectHash = hashContent(
    JSON.stringify(project.storyBible) + project.content,
  );

  if (existing && existing.projectHash === projectHash) {
    return existing;
  }

  const index: ContinuityIndex = {
    characters: new Map(),
    plotThreads: new Map(),
    worldState: {
      currentTime: "unknown",
      currentLocation: "unknown",
      recentEvents: [],
    },
    projectHash,
  };

  // Populate from story bible
  if (project.storyBible?.characters) {
    for (const char of project.storyBible!.characters) {
      index.characters.set(char.name.toLowerCase(), {
        lastLocation: "unknown",
        lastEmotion: "unknown",
        lastAction: "unknown",
        relationships: {},
        updatedAt: Date.now(),
      });

      // Extract relationships
      if (char.relationships) {
        for (const rel of char.relationships) {
          index.characters.get(char.name.toLowerCase())!.relationships[
            rel.characterId
          ] = rel.type;
        }
      }
    }
  }

  // Populate plot threads
  if (project.storyBible?.plotStructure?.plotThreads) {
    for (const thread of project.storyBible!.plotStructure.plotThreads) {
      index.plotThreads.set(thread.id, {
        status: thread.status as "active" | "resolved" | "paused",
        lastMention: "",
        triggers: [],
      });
    }
  }

  caches.continuityIndex.set(project.id, index);
  logger.info("Updated continuity index", {
    projectId: project.id,
    characters: index.characters.size,
  });
  return index;
}

// Quick continuity check using index (no API call)
// ============================================================================
// STRUCTURED CONTINUITY — 5 parallel passes, each narrow and specific
// ============================================================================

// text = rewriter can fix, bible = auto-populate, author = creative decision (surface to user)
const VIOLATION_FIXABILITY: Record<string, "text" | "bible" | "author"> = {
  // Scene roster
  unknown_character: "author",
  name_mismatch: "text",
  wrong_location: "text",
  // Voice
  forbidden_word: "text",
  voice_drift: "text",
  pov_break: "text",
  tense_shift: "text",
  // Fact
  contradiction: "text",
  premature_knowledge: "text",
  rule_violation: "text",
  description_mismatch: "text",
  // Timeline/spatial
  time_paradox: "text",
  teleportation: "text",
  missing_transition: "text",
  time_inconsistency: "text",
  // Relationships — arc-level conflicts require human judgment
  relationship_break: "author",
  role_violation: "author",
  dynamic_shift: "author",
  // New threads
  new_thread: "bible",
  // System
  parse_error: "author",
  check_error: "author",
};

function _defaultPassResult(check: string, weight: number): PassResult {
  return { check, pass: true, violations: [], weight };
}

function safeParse(
  check: string,
  text: string,
  weight: number,
  passLog: ReturnType<typeof createLogger>,
): PassResult {
  try {
    const result = JSON.parse(extractJSON(text)) as {
      pass?: boolean;
      violations?: unknown;
    };
    const rawViolations = Array.isArray(result.violations)
      ? result.violations
      : [];
    const parsed: PassResult = {
      check,
      pass: result.pass !== false,
      violations: rawViolations.map((violation) => {
        const record =
          typeof violation === "object" && violation !== null
            ? (violation as Partial<ContinuityViolation>)
            : {};
        const type =
          typeof record.type === "string" ? record.type : "parse_error";

        return {
          ...record,
          check,
          type,
          description:
            typeof record.description === "string"
              ? record.description
              : `Malformed violation payload for ${check}`,
          severity: record.severity === "error" ? "error" : "warning",
          fixable: VIOLATION_FIXABILITY[type] || "text",
        };
      }),
      weight,
    };
    passLog.info(
      `Parsed ${parsed.violations.length} violations, pass=${parsed.pass}`,
    );
    return parsed;
  } catch {
    passLog.error(`JSON parse failed — marking pass as errored`, {
      raw: text.slice(0, 200),
    });
    return {
      check,
      pass: false,
      violations: [
        {
          check,
          type: "parse_error",
          description: `AI returned unparseable response for ${check}`,
          severity: "warning",
          fixable: "author" as const,
        },
      ],
      weight,
      errored: true,
    };
  }
}

function collectSpoilers(characters: Character[]): string[] {
  return characters.flatMap((c) => c.spoilers || []);
}

// Pass 1: Scene Roster — who's here, do the names match the bible?
async function runSceneRosterCheck(
  newText: string,
  project: Project,
): Promise<PassResult> {
  const check = "scene_roster";
  const weight = 0.2;
  const passLog = createLogger(check);
  try {
    const characters = project.storyBible!.characters.map((c) => ({
      name: c.name,
      nicknames: c.nicknames || [],
      role: c.role,
    }));
    const locations =
      project.storyBible!.world?.locations?.map((l) => l.name) || [];
    passLog.info("Checking roster", {
      characters: characters.length,
      locations: locations.length,
    });

    const { text } = await chatCompletion(
      "You check character rosters in fiction scenes. Respond ONLY with valid JSON.",
      `KNOWN CHARACTERS (name + nicknames):\n${JSON.stringify(characters)}\n\nKNOWN LOCATIONS:\n${JSON.stringify(locations)}\n\nTEXT TO CHECK:\n${newText}\n\nIMPORTANT:\n- Proper names, codenames, and numbered designations are fixed referents, not interchangeable labels.\n- Treat "Five" and "Asset Five" as different references unless the bible explicitly says they are the same thing.\n\nCheck:\n1. Do any character names not match the bible (wrong spelling, casing)? Check against name AND nicknames. IMPORTANT: If a character is referred to by a NICKNAME listed in the bible, that is VALID — do NOT flag nickname usage as name_mismatch.\n2. Does anyone appear who hasn't been introduced in the bible? IMPORTANT: Unnamed/generic references like "a girl", "a teacher", "someone" are NOT violations — only flag characters given a specific proper name not in the bible.\n3. Are characters in locations that make sense?\n\nReturn JSON:\n{"pass":true/false,"violations":[{"type":"unknown_character"|"name_mismatch"|"wrong_location","description":"...","severity":"error"|"warning","fix":"suggested fix","character":"name"}]}`,
      { maxTokens: 4000, temperature: 0.2, topP: 0.8 },
    );
    return safeParse(check, text, weight, passLog);
  } catch (e) {
    passLog.error("Check failed", { error: String(e) });
    return {
      check,
      pass: false,
      violations: [
        {
          check,
          type: "check_error",
          description: `Scene roster check failed: ${String(e)}`,
          severity: "warning",
          fixable: "author" as const,
        },
      ],
      weight,
      errored: true,
    };
  }
}

// Pass 2: Voice Consistency — does the POV voice match the character?
async function runVoiceConsistencyCheck(
  newText: string,
  project: Project,
  povCharacterName: string,
): Promise<PassResult> {
  const check = "voice_consistency";
  const weight = 0.25;
  const passLog = createLogger(check);
  try {
    const styleDir =
      project.storyBible!.styleDirectives ||
      ({} as StoryBible["styleDirectives"]);
    // Fuzzy POV match: exact name, nickname match, or substring match (handles "Penelope Hart" vs "Penelope")
    const povLower = povCharacterName.toLowerCase();
    const povChar =
      project.storyBible!.characters.find((c) => {
        const nameLower = c.name.toLowerCase();
        if (nameLower === povLower) return true;
        if ((c.nicknames || []).some((n) => n.toLowerCase() === povLower))
          return true;
        if (povLower.includes(nameLower) || nameLower.includes(povLower))
          return true;
        return false;
      }) || null;

    const povData = povChar
      ? {
          name: povChar.name,
          primaryMode: povChar.cognitiveFilter?.primaryMode || "unknown",
          internalLanguage: povChar.cognitiveFilter?.internalLanguage || "",
          forbiddenWords: povChar.cognitiveFilter?.forbiddenWords || [],
          signatureThoughts: povChar.cognitiveFilter?.signatureThoughts || [],
          vocabulary: povChar.voice?.vocabulary || "",
          speechPatterns: povChar.voice?.speechPatterns || [],
        }
      : null;

    passLog.info("Checking voice", {
      povCharacter: povCharacterName,
      hasCognitiveFilter: !!povChar?.cognitiveFilter,
      forbiddenWords: povData?.forbiddenWords?.length || 0,
    });

    const { text } = await chatCompletion(
      "You check voice consistency in fiction. Respond ONLY with valid JSON.",
      `STYLE DIRECTIVES:\nPOV: ${styleDir.pov || "unknown"}\nTense: ${styleDir.tense || "unknown"}\nProse style: ${styleDir.proseStyle || "unknown"}\n\nPOV CHARACTER:\n${JSON.stringify(povData)}\n\nFORBIDDEN WORDS (this character would NEVER think/say):\n${JSON.stringify(povData?.forbiddenWords || [])}\n\nTEXT TO CHECK:\n${newText}\n\nCheck:\n1. Does internal monologue match cognitive mode "${povData?.primaryMode}"?\n2. Are any forbidden words used?\n3. Does the voice drift into a different character's patterns?\n4. Is POV/tense consistent with directives?\n\nReturn JSON:\n{"pass":true/false,"violations":[{"type":"forbidden_word"|"voice_drift"|"pov_break"|"tense_shift","description":"...","severity":"error"|"warning","fix":"suggested fix","line":"offending text","character":"name"}]}`,
      { maxTokens: 4000, temperature: 0.2, topP: 0.8 },
    );
    return safeParse(check, text, weight, passLog);
  } catch (e) {
    passLog.error("Check failed", { error: String(e) });
    return {
      check,
      pass: false,
      violations: [
        {
          check,
          type: "check_error",
          description: `Voice check failed: ${String(e)}`,
          severity: "warning",
          fixable: "author" as const,
        },
      ],
      weight,
      errored: true,
    };
  }
}

// Pass 3: Fact Continuity — contradictions, premature knowledge, rule violations
async function runFactContinuityCheck(
  newText: string,
  project: Project,
  continuityContext?: ReturnType<typeof resolveContinuityContext>,
): Promise<PassResult> {
  const check = "fact_continuity";
  const weight = 0.25;
  const passLog = createLogger(check);
  try {
    const spoilerExclusions = collectSpoilers(project.storyBible!.characters);
    const characters = project.storyBible!.characters.map((c) => ({
      name: c.name,
      description: c.description,
      backstory: c.unrevealed ? "[HIDDEN]" : c.backstory,
    }));
    const world = project.storyBible!.world || ({} as StoryBible["world"]);
    const chapterScope = continuityContext || resolveContinuityContext(project);
    const recentContent = chapterScope.recentContent;
    const chapterContext = chapterScope.chapterOutline
      ? [
          `Chapter: ${chapterScope.chapterOutline.title || `Chapter ${chapterScope.chapterOutline.chapterNumber}`}`,
          chapterScope.chapterOutline.summary
            ? `Summary: ${chapterScope.chapterOutline.summary}`
            : "",
          chapterScope.chapterOutline.timeframe
            ? `Timeframe: ${chapterScope.chapterOutline.timeframe}`
            : "",
          chapterScope.chapterOutline.location
            ? `Location: ${chapterScope.chapterOutline.location}`
            : "",
        ]
          .filter(Boolean)
          .join("\n")
      : "No chapter outline available.";

    passLog.info("Checking facts", {
      characters: characters.length,
      spoilerExclusions: spoilerExclusions.length,
      recentContentLen: recentContent.length,
    });

    const spoilerNote =
      spoilerExclusions.length > 0
        ? `\n\nINTENTIONAL UNREVEALED PLOT POINTS (do NOT flag these as issues):\n${spoilerExclusions.map((s) => `- ${s}`).join("\n")}`
        : "";

    const { text } = await chatCompletion(
      "You check factual continuity in fiction. Respond ONLY with valid JSON.",
      `ESTABLISHED CHARACTERS:\n${JSON.stringify(characters)}\n\nWORLD FACTS:\nSetting: ${world.setting || "unknown"}\nTime period: ${world.timePeriod || "unknown"}\nRules: ${JSON.stringify(world.rules || [])}\nLocations: ${JSON.stringify(world.locations || [])}\n\nACTIVE CHAPTER CONTEXT:\n${chapterContext}\n\nRECENT LOCAL STORY (plain text):\n${recentContent}${spoilerNote}\n\nNEW TEXT TO CHECK:\n${newText}\n\nIMPORTANT:\n- Judge continuity against the active chapter/local scene context first, not the end of the full book.\n- Flashbacks, frame chapters, recordings, and earlier-timeline scenes are allowed when the chapter context or text signals them.\n- Do NOT flag a character as contradictory merely because the broader canon knows they die later.\n- Proper names, codenames, and numbered designations are fixed referents. Reusing an established name/designation for a different person, sensor, feed, room, or device is a contradiction.\n\nCheck:\n1. Does anything contradict established physical descriptions?\n2. Do characters know things they shouldn't know yet at this point in the timeline?\n3. Are world rules violated?\n4. Are previously established facts for THIS chapter/timeframe contradicted?\n5. Is an established codename or numbered designation being reassigned to a different referent?\n\nReturn JSON:\n{"pass":true/false,"violations":[{"type":"contradiction"|"premature_knowledge"|"rule_violation"|"description_mismatch","description":"...","severity":"error"|"warning","fix":"suggested fix"}]}`,
      { maxTokens: 4000, temperature: 0.2, topP: 0.8 },
    );
    return safeParse(check, text, weight, passLog);
  } catch (e) {
    passLog.error("Check failed", { error: String(e) });
    return {
      check,
      pass: false,
      violations: [
        {
          check,
          type: "check_error",
          description: `Fact check failed: ${String(e)}`,
          severity: "warning",
          fixable: "author" as const,
        },
      ],
      weight,
      errored: true,
    };
  }
}

// Pass 4: Timeline/Spatial — time paradoxes, teleportation, missing transitions
async function runTimelineSpatialCheck(
  newText: string,
  project: Project,
  continuityContext?: ReturnType<typeof resolveContinuityContext>,
): Promise<PassResult> {
  const check = "timeline_spatial";
  const weight = 0.15;
  const passLog = createLogger(check);
  try {
    const locations = project.storyBible!.world?.locations || [];
    const chapterScope = continuityContext || resolveContinuityContext(project);
    const recentContent = chapterScope.recentContent;
    const chapterContext = chapterScope.chapterOutline
      ? [
          `Chapter: ${chapterScope.chapterOutline.title || `Chapter ${chapterScope.chapterOutline.chapterNumber}`}`,
          chapterScope.chapterOutline.summary
            ? `Summary: ${chapterScope.chapterOutline.summary}`
            : "",
          chapterScope.chapterOutline.timeframe
            ? `Timeframe: ${chapterScope.chapterOutline.timeframe}`
            : "",
          chapterScope.chapterOutline.location
            ? `Location: ${chapterScope.chapterOutline.location}`
            : "",
        ]
          .filter(Boolean)
          .join("\n")
      : "No chapter outline available.";

    passLog.info("Checking timeline/spatial", {
      locations: locations.length,
      recentContentLen: recentContent.length,
    });

    const { text } = await chatCompletion(
      "You check timeline and spatial continuity in fiction. Respond ONLY with valid JSON.",
      `KNOWN LOCATIONS:\n${JSON.stringify(locations)}\n\nACTIVE CHAPTER CONTEXT:\n${chapterContext}\n\nRECENT LOCAL STORY (plain text, for time/place context):\n${recentContent}\n\nNEW TEXT TO CHECK:\n${newText}\n\nIMPORTANT:\n- Judge timeline and space against the active chapter/local scene context first.\n- Flashbacks, recordings, and frame chapters are allowed if they are signaled in the text or chapter context.\n- Do NOT assume the 'recent local story' must be the latest point in the full book chronology.\n\nCheck:\n1. Does time pass logically inside this chapter/scene (no sun setting twice, no impossible durations)?\n2. Did characters teleport between locations without transition?\n3. Are scene transitions smooth or jarring?\n4. Is time of day consistent within the scene?\n\nReturn JSON:\n{"pass":true/false,"violations":[{"type":"time_paradox"|"teleportation"|"missing_transition"|"time_inconsistency","description":"...","severity":"error"|"warning","fix":"suggested fix"}]}`,
      { maxTokens: 4000, temperature: 0.2, topP: 0.8 },
    );
    return safeParse(check, text, weight, passLog);
  } catch (e) {
    passLog.error("Check failed", { error: String(e) });
    return {
      check,
      pass: false,
      violations: [
        {
          check,
          type: "check_error",
          description: `Timeline check failed: ${String(e)}`,
          severity: "warning",
          fixable: "author" as const,
        },
      ],
      weight,
      errored: true,
    };
  }
}

// Pass 5: Relationship State — dynamics, power balance, role consistency
async function runRelationshipStateCheck(
  newText: string,
  project: Project,
): Promise<PassResult> {
  const check = "relationship_state";
  const weight = 0.15;
  const passLog = createLogger(check);
  try {
    const revealedChars = project.storyBible!.characters.filter(
      (c) => !c.unrevealed,
    );
    const relationships = revealedChars.flatMap((c) =>
      (c.relationships || [])
        .map((r) => {
          const target = revealedChars.find((tc) => tc.id === r.characterId);
          if (!target) return null;
          return {
            from: c.name,
            to: target.name,
            type: r.type,
            description: r.description,
          };
        })
        .filter(Boolean),
    );
    const roles = revealedChars.map((c) => ({
      name: c.name,
      role: c.role,
      motivation: c.motivation,
    }));

    passLog.info("Checking relationships", {
      relationships: relationships.length,
      roles: roles.length,
    });

    const { text } = await chatCompletion(
      "You check relationship consistency in fiction. Respond ONLY with valid JSON.",
      `RELATIONSHIP MAP:\n${JSON.stringify(relationships)}\n\nCHARACTER ROLES:\n${JSON.stringify(roles)}\n\nNEW TEXT TO CHECK:\n${newText}\n\nCheck:\n1. Are character interactions consistent with their established dynamics?\n2. Is anyone acting out of role without justification?\n3. Do power dynamics match the relationship map?\n\nReturn JSON:\n{"pass":true/false,"violations":[{"type":"relationship_break"|"role_violation"|"dynamic_shift","description":"...","severity":"error"|"warning","fix":"suggested fix","character":"name"}]}`,
      { maxTokens: 4000, temperature: 0.2, topP: 0.8 },
    );
    return safeParse(check, text, weight, passLog);
  } catch (e) {
    passLog.error("Check failed", { error: String(e) });
    return {
      check,
      pass: false,
      violations: [
        {
          check,
          type: "check_error",
          description: `Relationship check failed: ${String(e)}`,
          severity: "warning",
          fixable: "author" as const,
        },
      ],
      weight,
      errored: true,
    };
  }
}

// ============================================================================
// BIBLE AUTO-POPULATION — seeds new entities from generated text
// ============================================================================

async function _autoPopulateBible(
  generatedText: string,
  project: Project,
  bibleViolations: ContinuityViolation[],
): Promise<{ characters: Character[]; locations: Location[] }> {
  const popLog = createLogger("bible-autopopulate");
  if (!project.storyBible || bibleViolations.length === 0) {
    return { characters: [], locations: [] };
  }

  // Collect entity names from violations for targeted extraction
  const unknownNames = bibleViolations
    .filter((v) => v.type === "unknown_character" || v.type === "name_mismatch")
    .map((v) => v.character || v.description)
    .filter(Boolean);
  const locationHints = bibleViolations
    .filter((v) => v.type === "wrong_location" || v.type === "new_thread")
    .map((v) => v.description)
    .filter(Boolean);

  popLog.info("Extracting new entities from generated text", {
    unknownNames: unknownNames.length,
    locationHints: locationHints.length,
  });

  try {
    const existingCharNames = project.storyBible!.characters.map((c) =>
      c.name.toLowerCase(),
    );
    const existingLocNames = (project.storyBible!.world?.locations || []).map(
      (l) => l.name.toLowerCase(),
    );

    const { text } = await chatCompletion(
      "You extract new story entities from fiction text. Respond ONLY with valid JSON.",
      `EXISTING CHARACTERS (do NOT re-extract these): ${project.storyBible!.characters.map((c) => c.name).join(", ")}\n\nEXISTING LOCATIONS: ${(project.storyBible!.world?.locations || []).map((l) => l.name).join(", ")}\n\nFLAGGED UNKNOWN NAMES: ${unknownNames.join(", ")}\nFLAGGED LOCATION/THREAD HINTS: ${locationHints.join("; ")}\n\nGENERATED TEXT:\n${generatedText}\n\nExtract ONLY entities that appear in the text but are NOT in the existing lists above. For each, use ONLY what the text explicitly states — do not invent details.\n\nReturn JSON:\n{"characters":[{"name":"as written in text","role":"minor","description":"what the text says about them"}],"locations":[{"name":"as written in text","description":"what the text says about it","significance":"its role in the scene"}]}`,
      { maxTokens: 2000, temperature: 0.1, topP: 0.9 },
    );

    const parsed = JSON.parse(extractJSON(text));
    const newCharacters: Character[] = [];
    const newLocations: Location[] = [];

    for (const c of parsed.characters || []) {
      if (!c.name || existingCharNames.includes(c.name.toLowerCase())) continue;
      // Reject unnamed/generic references — only proper-named characters belong in the bible
      const cNameLower = c.name.toLowerCase();
      if (
        /^(a |the |some |one of |that |this )/.test(cNameLower) ||
        !/[A-Z]/.test(c.name)
      )
        continue;
      newCharacters.push({
        id: crypto.randomUUID(),
        name: c.name,
        role: c.role || "minor",
        description: c.description || "",
        backstory: "",
        motivation: "",
        fears: [],
        flaw: "",
        arc: "",
        voice: { vocabulary: "", speechPatterns: [], catchphrases: [] },
        relationships: [],
        autoGenerated: true,
      });
    }

    for (const l of parsed.locations || []) {
      if (!l.name || existingLocNames.includes(l.name.toLowerCase())) continue;
      // Reject architectural features and furniture — only narrative-significant places
      const lNameLower = l.name.toLowerCase();
      if (
        /^(a |the |some |this |that )/.test(lNameLower) ||
        /\b(door|window|wall|floor|desk|chair|table|hallway|corridor|stairs|ceiling|corner)\b/.test(
          lNameLower,
        )
      )
        continue;
      newLocations.push({
        name: l.name,
        description: l.description || "",
        significance: l.significance || "",
        autoGenerated: true,
      });
    }

    // Merge into live bible immediately
    if (newCharacters.length > 0) {
      project.storyBible!.characters.push(...newCharacters);
      popLog.info(
        `Added ${newCharacters.length} auto-generated characters: ${newCharacters.map((c) => c.name).join(", ")}`,
      );
    }
    if (newLocations.length > 0) {
      if (!project.storyBible!.world) {
        project.storyBible!.world = {
          setting: "",
          timePeriod: "",
          locations: [],
          rules: [],
        };
      }
      project.storyBible!.world.locations.push(...newLocations);
      popLog.info(
        `Added ${newLocations.length} auto-generated locations: ${newLocations.map((l) => l.name).join(", ")}`,
      );
    }

    if (newCharacters.length > 0 || newLocations.length > 0) {
      persistProjects();
    }

    return { characters: newCharacters, locations: newLocations };
  } catch (e) {
    popLog.error("Auto-population failed", { error: String(e) });
    return { characters: [], locations: [] };
  }
}

// ============================================================================
// CONTEXT BUILDER - Assembles bidirectional context with caching
// ============================================================================

function buildGenerationContext(
  project: Project,
  contextWindow: ContextWindow,
  userPrompt: string,
  options: {
    chapterId?: string;
    scenePlan?: ScenePromptPlanRecord | null;
    narrativeState?: {
      time: string;
      location: string;
      povCharacter: string;
      mood: string;
    };
    continuityIndex?: ContinuityIndex;
    selectedThreadIds?: string[];
    mandatoryBeat?: string;
    completedBeats?: string[];
    remainingPlotPoints?: string[];
    mode?: "manual" | "autonomous";
  } = {},
): {
  systemPrompt: string;
  userMessage: string;
  debug: Record<string, unknown>;
} {
  const preferredContextChars = Math.max(
    2000,
    Math.min(
      TOKEN_LIMITS.MAIN_GENERATION.input,
      userPreferences.memorySettings.contextWindowSize || 10000,
    ),
  );
  const effectiveContextWindow: ContextWindow = {
    before: contextWindow.before.slice(-preferredContextChars),
    after:
      options.mode === "autonomous"
        ? ""
        : contextWindow.after.slice(0, Math.min(preferredContextChars, 12000)),
    cursorPosition: contextWindow.cursorPosition,
  };

  return buildCuratedPrompt({
    projectMemory: selectRelevantProjectMemory({
      memory: lifetimeMemory,
      project,
      chapterId: options.chapterId,
      focusText: [
        userPrompt,
        effectiveContextWindow.before.slice(-4000),
        effectiveContextWindow.after.slice(0, 1500),
      ]
        .filter(Boolean)
        .join("\n"),
    }),
    project,
    contextWindow: effectiveContextWindow,
    userPrompt,
    chapterId: options.chapterId,
    scenePlan: options.scenePlan
      ? {
          directive: options.scenePlan.directive,
          selectedEvidence: options.scenePlan.selectedEvidence,
        }
      : null,
    narrativeState: options.narrativeState,
    continuityIndex: options.continuityIndex,
    styleFingerprint: userPreferences.styleFingerprint,
    craftPatterns,
    lifetimeInsights: lifetimeMemory.insights,
    preferenceMemory: userPreferences.memorySettings,
    selectedThreadIds: options.selectedThreadIds,
    mandatoryBeat: options.mandatoryBeat,
    completedBeats: options.completedBeats,
    remainingPlotPoints: options.remainingPlotPoints,
    mode: options.mode,
  });
}

const narrativeService = createNarrativeService({
  chatCompletion,
  tokenLimits: {
    NARRATIVE_STATE: TOKEN_LIMITS.NARRATIVE_STATE,
    POLISH_TEXT: TOKEN_LIMITS.POLISH_TEXT,
  },
});
const { extractNarrativeState, polishText } = narrativeService;

// ============================================================================
// STYLE ANALYZER - Learns from writing samples
// ============================================================================

async function analyzeWritingSample(
  sample: string,
): Promise<Partial<StyleFingerprint>> {
  // Check cache first
  const sampleHash = hashContent(sample);
  const cached = caches.styleAnalysis.get(sampleHash);
  if (cached && Date.now() - cached.timestamp < CONFIG.STYLE_CACHE_TTL_MS) {
    logger.info("Using cached style analysis");
    return cached.data;
  }

  // Basic text analysis
  const sentences = sample.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  const words = sample.split(/\s+/).filter((w) => w.length > 0);
  const avgSentenceLength = words.length / Math.max(sentences.length, 1);

  // Dialogue detection
  const dialogueMatches = sample.match(/[""][^""]+[""]/g) || [];
  const dialogueWords = dialogueMatches.join(" ").split(/\s+/).length;
  const dialogueRatio = dialogueWords / Math.max(words.length, 1);

  // Extract dialogue tags locally
  const localDialogueTags = [
    ...sample.matchAll(/[""][^""]+[""]\s*(\w+ed|\w+ly\s+\w+ed)/gi),
  ]
    .map((match) => match[1]?.toLowerCase())
    .filter((tag): tag is string => Boolean(tag));

  // Passive voice detection
  const passivePatterns = /\b(was|were|been|being|is|are|am)\s+\w+ed\b/gi;
  const passiveMatches = sample.match(passivePatterns) || [];
  const passiveVoiceRatio =
    passiveMatches.length / Math.max(sentences.length, 1);

  // Adverb detection
  const adverbPattern = /\b\w+ly\b/gi;
  const adverbMatches = sample.match(adverbPattern) || [];
  const adverbDensity =
    (adverbMatches.length / Math.max(words.length, 1)) * 100;

  // Vocabulary complexity
  const avgWordLength =
    words.reduce((sum, w) => sum + w.length, 0) / Math.max(words.length, 1);
  const vocabularyComplexity = Math.min(1, (avgWordLength - 3) / 5);

  // Extract sentence length patterns (rhythm DNA)
  const sentenceLengths = sentences.map((s) => s.split(/\s+/).length);
  const rhythmPatterns: string[] = [];
  for (let i = 0; i < sentenceLengths.length - 2; i++) {
    const pattern = sentenceLengths.slice(i, i + 3);
    if (pattern[0] < 8 && pattern[1] < 8 && pattern[2] > 20) {
      rhythmPatterns.push("Short. Short. Then long build.");
    } else if (pattern[0] > 25 && pattern[1] < 10) {
      rhythmPatterns.push("Long sentence followed by punchy short.");
    }
  }

  // Extract paragraph openers
  const paragraphs = sample.split(/\n\n+/).filter((p) => p.trim().length > 20);
  const openerTypes: string[] = [];
  for (const para of paragraphs.slice(0, 10)) {
    if (/^(he|she|they|i)\b/i.test(para)) openerTypes.push("Character action");
    else if (
      /^(the|a|an)\s+(sun|moon|sky|air|room|silence|darkness)/i.test(para)
    )
      openerTypes.push("Sensory/setting");
    else if (/^[""]/.test(para)) openerTypes.push("Dialogue first");
    else if (/^(when|after|before|as)\b/i.test(para))
      openerTypes.push("Temporal");
  }

  // Use AI for deep voice analysis
  let richAnalysis: RichStyleAnalysis = {};
  try {
    const { text } = await chatCompletion(
      "You are an elite literary analyst with deep expertise in prose style, voice, and craft. Your task is to create a precise DNA fingerprint of this author's unique voice. Respond only with valid JSON.",
      `CRITICAL TASK: Analyze this writing sample with the precision of a forensic linguist. Extract the SPECIFIC, UNIQUE characteristics that make this author's voice distinctive.

DO NOT give generic writing advice. DO NOT describe what "good writing" looks like in general.
ONLY describe what THIS SPECIFIC AUTHOR does.

Think like you're creating a style guide that would allow someone to perfectly imitate this author's voice.

WRITING SAMPLE TO ANALYZE:
${sample.slice(0, TOKEN_LIMITS.STYLE_ANALYSIS.input)}

Analyze carefully and return a JSON object:
{
  "tone": "A precise, evocative descriptor of the overall voice (NOT generic like 'engaging' - specific like 'wry noir with undercurrents of melancholy' or 'conversational warmth cut with sardonic observations')",

  "showVsTellRatio": number 0-1 (0=all telling, 1=all showing),
  "metaphorFrequency": number 0-1 (how often figurative language appears),

  "strengths": ["3-5 SPECIFIC strengths unique to THIS author - not generic praise"],
  "improvements": ["1-2 areas where this author could grow"],

  "signaturePhrases": [
    "Quote 5-8 ACTUAL phrases, sentence constructions, or expressions that are characteristic of this author's voice. These should be patterns you'd recognize as 'theirs' - specific word combinations, syntactic habits, recurring metaphorical frameworks."
  ],

  "dialogueTags": {
    "preferred": ["ACTUAL dialogue tags/beats this author uses - pull from the text"],
    "avoided": ["tags/approaches conspicuously absent from their writing"]
  },

  "verbChoices": {
    "movement": ["ACTUAL movement verbs this author favors - quote from text"],
    "speech": ["ACTUAL speech verbs beyond 'said' - quote from text"],
    "emotion": ["How this author renders emotion through physical action - describe the technique AND give examples from text"]
  },

  "sentencePatterns": [
    "Describe 3-5 distinctive RHYTHM patterns with examples. How do they vary sentence length? When do they use fragments? How do they build to a climax? What's their paragraph structure?"
  ],

  "sceneOpenings": [
    "How does this author open scenes? Sensory grounding? Mid-action? Dialogue? Internal thought? Give specific examples."
  ],

  "tensionTechniques": [
    "SPECIFIC techniques this author uses to build tension. Quote examples. How do they handle pacing? Withhold information? Use sentence structure?"
  ],

  "humorStyle": "Describe PRECISELY how this author handles humor (if present). Is it character-based? Situational? Verbal? Deadpan? Dark? Quote examples.",

  "emotionalPalette": [
    "What emotional registers does this author work in most effectively? Not just 'happy/sad' but nuanced states like 'bittersweet nostalgia', 'quiet desperation', 'fierce protectiveness'. Quote passages that demonstrate each."
  ],

  "exemplars": [
    "Quote 3-5 of the BEST, most characteristic passages from this sample. These should be the sentences/paragraphs that most clearly exemplify this author's unique voice - the passages an AI should study to capture their style. Full quotes, not summaries."
  ],

  "proseTechniques": [
    "What specific prose techniques define this author? Anaphora? Lists? Parentheticals? Particular metaphor types? Long descriptive passages vs. tight action? Quote examples."
  ],

  "pacing": "How does this author handle pacing? Do they linger on moments? Rush through action? Alternate? Describe with examples."
}

Remember: SPECIFICITY is everything. Generic analysis is useless. Quote directly from the text. Name the exact techniques. This fingerprint should be so precise that it could recreate this author's voice.`,
      { maxTokens: TOKEN_LIMITS.STYLE_ANALYSIS.output },
    );

    richAnalysis = JSON.parse(extractJSON(text)) as RichStyleAnalysis;
  } catch (e) {
    logger.error("Rich style analysis error", { error: String(e) });
  }

  const result: Partial<StyleFingerprint> = {
    vocabularyComplexity,
    avgSentenceLength,
    dialogueRatio,
    showVsTellRatio: richAnalysis.showVsTellRatio ?? 0.5,
    passiveVoiceRatio,
    adverbDensity,
    metaphorFrequency: richAnalysis.metaphorFrequency ?? 0,
    toneDescriptor: richAnalysis.tone || "neutral",
    strengthAreas: richAnalysis.strengths || [],
    improvementAreas: richAnalysis.improvements || [],

    // Rich fingerprint fields
    signaturePhrases: richAnalysis.signaturePhrases || [],
    dialogueTags: {
      preferred:
        richAnalysis.dialogueTags?.preferred || localDialogueTags.slice(0, 5),
      avoided: richAnalysis.dialogueTags?.avoided || [],
    },
    verbChoices: {
      movement: richAnalysis.verbChoices?.movement || [],
      speech: richAnalysis.verbChoices?.speech || [],
      emotion: richAnalysis.verbChoices?.emotion || [],
    },
    sentencePatterns:
      richAnalysis.sentencePatterns || [...new Set(rhythmPatterns)].slice(0, 3),
    paragraphOpeners: [...new Set(openerTypes)].slice(0, 4),
    sceneOpenings: richAnalysis.sceneOpenings || [],
    tensionTechniques: richAnalysis.tensionTechniques || [],
    exemplars: richAnalysis.exemplars || [],
    humorStyle: richAnalysis.humorStyle || "",
    emotionalPalette: richAnalysis.emotionalPalette || [],
    avoidances: [],
    proseTechniques: richAnalysis.proseTechniques || [],
    pacing: richAnalysis.pacing || "",
  };

  // Cache the result
  caches.styleAnalysis.set(sampleHash, {
    hash: sampleHash,
    data: result,
    timestamp: Date.now(),
  });

  return result;
}

function aggregateStyleFingerprint(
  current: StyleFingerprint | null,
  newAnalysis: Partial<StyleFingerprint>,
  sample: string,
): StyleFingerprint {
  const defaultFingerprint: StyleFingerprint = {
    vocabularyComplexity: 0.5,
    avgSentenceLength: 15,
    dialogueRatio: 0.3,
    showVsTellRatio: 0.5,
    passiveVoiceRatio: 0.1,
    adverbDensity: 2,
    metaphorFrequency: 0.2,
    pacingScore: 0.5,
    toneDescriptor: "neutral",
    strengthAreas: [],
    improvementAreas: [],
    sampleCount: 0,
    rawSamples: [],
    // Rich fingerprint defaults
    signaturePhrases: [],
    dialogueTags: { preferred: [], avoided: [] },
    verbChoices: { movement: [], speech: [], emotion: [] },
    sentencePatterns: [],
    paragraphOpeners: [],
    sceneOpenings: [],
    tensionTechniques: [],
    exemplars: [],
    humorStyle: "",
    emotionalPalette: [],
    avoidances: [],
    proseTechniques: [],
    pacing: "",
  };

  if (!current) {
    return {
      ...defaultFingerprint,
      vocabularyComplexity: newAnalysis.vocabularyComplexity || 0.5,
      avgSentenceLength: newAnalysis.avgSentenceLength || 15,
      dialogueRatio: newAnalysis.dialogueRatio || 0.3,
      showVsTellRatio: newAnalysis.showVsTellRatio || 0.5,
      passiveVoiceRatio: newAnalysis.passiveVoiceRatio || 0.1,
      adverbDensity: newAnalysis.adverbDensity || 2,
      metaphorFrequency: newAnalysis.metaphorFrequency || 0.2,
      toneDescriptor: newAnalysis.toneDescriptor || "neutral",
      strengthAreas: newAnalysis.strengthAreas || [],
      improvementAreas: newAnalysis.improvementAreas || [],
      sampleCount: 1,
      rawSamples: [sample.slice(0, CONFIG.MAX_SAMPLE_CHARS)],
      // Rich fields from first analysis
      signaturePhrases: newAnalysis.signaturePhrases || [],
      dialogueTags: newAnalysis.dialogueTags || { preferred: [], avoided: [] },
      verbChoices: newAnalysis.verbChoices || {
        movement: [],
        speech: [],
        emotion: [],
      },
      sentencePatterns: newAnalysis.sentencePatterns || [],
      paragraphOpeners: newAnalysis.paragraphOpeners || [],
      sceneOpenings: newAnalysis.sceneOpenings || [],
      tensionTechniques: newAnalysis.tensionTechniques || [],
      exemplars: newAnalysis.exemplars || [],
      humorStyle: newAnalysis.humorStyle || "",
      emotionalPalette: newAnalysis.emotionalPalette || [],
      avoidances: newAnalysis.avoidances || [],
      proseTechniques: newAnalysis.proseTechniques || [],
      pacing: newAnalysis.pacing || "",
    };
  }

  const n = current.sampleCount;
  const weight = 1 / (n + 1);

  // Merge arrays uniquely, keeping most recent/relevant
  const mergeArrays = (
    curr: string[],
    newArr: string[],
    maxLen: number,
  ): string[] => [...new Set([...(newArr || []), ...curr])].slice(0, maxLen);

  return {
    // Weighted average for numeric fields
    vocabularyComplexity:
      current.vocabularyComplexity * (1 - weight) +
      (newAnalysis.vocabularyComplexity || current.vocabularyComplexity) *
        weight,
    avgSentenceLength:
      current.avgSentenceLength * (1 - weight) +
      (newAnalysis.avgSentenceLength || current.avgSentenceLength) * weight,
    dialogueRatio:
      current.dialogueRatio * (1 - weight) +
      (newAnalysis.dialogueRatio || current.dialogueRatio) * weight,
    showVsTellRatio:
      current.showVsTellRatio * (1 - weight) +
      (newAnalysis.showVsTellRatio || current.showVsTellRatio) * weight,
    passiveVoiceRatio:
      current.passiveVoiceRatio * (1 - weight) +
      (newAnalysis.passiveVoiceRatio || current.passiveVoiceRatio) * weight,
    adverbDensity:
      current.adverbDensity * (1 - weight) +
      (newAnalysis.adverbDensity || current.adverbDensity) * weight,
    metaphorFrequency:
      current.metaphorFrequency * (1 - weight) +
      (newAnalysis.metaphorFrequency || current.metaphorFrequency) * weight,
    pacingScore: current.pacingScore,
    toneDescriptor: newAnalysis.toneDescriptor || current.toneDescriptor,
    strengthAreas: mergeArrays(
      current.strengthAreas,
      newAnalysis.strengthAreas || [],
      5,
    ),
    improvementAreas: mergeArrays(
      current.improvementAreas,
      newAnalysis.improvementAreas || [],
      3,
    ),
    sampleCount: n + 1,
    rawSamples: [
      ...current.rawSamples.slice(-4),
      sample.slice(0, CONFIG.MAX_SAMPLE_CHARS),
    ],

    // Rich fingerprint - merge and accumulate
    signaturePhrases: mergeArrays(
      current.signaturePhrases,
      newAnalysis.signaturePhrases || [],
      10,
    ),
    dialogueTags: {
      preferred: mergeArrays(
        current.dialogueTags?.preferred || [],
        newAnalysis.dialogueTags?.preferred || [],
        8,
      ),
      avoided: mergeArrays(
        current.dialogueTags?.avoided || [],
        newAnalysis.dialogueTags?.avoided || [],
        5,
      ),
    },
    verbChoices: {
      movement: mergeArrays(
        current.verbChoices?.movement || [],
        newAnalysis.verbChoices?.movement || [],
        10,
      ),
      speech: mergeArrays(
        current.verbChoices?.speech || [],
        newAnalysis.verbChoices?.speech || [],
        10,
      ),
      emotion: mergeArrays(
        current.verbChoices?.emotion || [],
        newAnalysis.verbChoices?.emotion || [],
        10,
      ),
    },
    sentencePatterns: mergeArrays(
      current.sentencePatterns,
      newAnalysis.sentencePatterns || [],
      5,
    ),
    paragraphOpeners: mergeArrays(
      current.paragraphOpeners,
      newAnalysis.paragraphOpeners || [],
      5,
    ),
    sceneOpenings: mergeArrays(
      current.sceneOpenings,
      newAnalysis.sceneOpenings || [],
      5,
    ),
    tensionTechniques: mergeArrays(
      current.tensionTechniques,
      newAnalysis.tensionTechniques || [],
      5,
    ),
    exemplars: mergeArrays(current.exemplars, newAnalysis.exemplars || [], 6),
    humorStyle: newAnalysis.humorStyle || current.humorStyle,
    emotionalPalette: mergeArrays(
      current.emotionalPalette,
      newAnalysis.emotionalPalette || [],
      6,
    ),
    avoidances: mergeArrays(
      current.avoidances,
      newAnalysis.avoidances || [],
      10,
    ),
    proseTechniques: mergeArrays(
      current.proseTechniques || [],
      newAnalysis.proseTechniques || [],
      8,
    ),
    pacing: newAnalysis.pacing || current.pacing || "",
  };
}

// Extract patterns from user feedback history to populate avoidances and craft patterns
function extractPatternsFromFeedback(): void {
  if (lifetimeMemory.feedbackHistory.length === 0) {
    refreshLifetimeInsights();
    return;
  }

  const avoidances: string[] = [];

  for (const fb of lifetimeMemory.feedbackHistory) {
    const feedback = fb.feedback.toLowerCase();
    const reason = fb.reason?.toLowerCase() || "";

    // Detect rejection patterns
    if (reason.includes("purple") || feedback.includes("purple")) {
      avoidances.push("Avoid purple prose - keep language grounded");
    }
    if (reason.includes("too long") || feedback.includes("too long")) {
      avoidances.push("Keep paragraphs shorter");
    }
    if (reason.includes("telling") || feedback.includes("telling")) {
      avoidances.push("Show more, tell less");
    }
    if (
      reason.includes("dialogue") &&
      (reason.includes("tag") || feedback.includes("tag"))
    ) {
      avoidances.push("Minimize dialogue tags - use action beats");
    }
    if (reason.includes("adverb") || feedback.includes("adverb")) {
      avoidances.push("Reduce adverbs - use stronger verbs");
    }
    if (reason.includes("passive") || feedback.includes("passive")) {
      avoidances.push("Use active voice");
    }
    if (reason.includes("repetit") || feedback.includes("repetit")) {
      avoidances.push("Vary sentence structure and word choice");
    }
  }

  // Update fingerprint avoidances
  if (userPreferences.styleFingerprint && avoidances.length > 0) {
    userPreferences.styleFingerprint.avoidances = [
      ...new Set([
        ...userPreferences.styleFingerprint.avoidances,
        ...avoidances,
      ]),
    ].slice(0, 15);
    persistPreferences();
    logger.info("Updated avoidances from feedback", {
      count: avoidances.length,
    });
  }

  // Auto-generate craft patterns from feedback
  const existingPatterns = new Set(craftPatterns.map((p) => p.pattern));
  for (const avoidance of avoidances) {
    if (!existingPatterns.has(avoidance)) {
      craftPatterns.push({
        id: crypto.randomUUID(),
        category: "feedback-derived",
        pattern: avoidance,
        example: "",
        effectiveness: 0.8,
      });
    }
  }
  persistCraftPatterns();
  refreshLifetimeInsights();
}

// ============================================================================
// CONTINUITY CHECKER - Validates consistency
// ============================================================================

interface ContinuityCheckContext {
  chapterId?: string;
  povCharacterName?: string;
  recentContent?: string;
}

function resolveContinuityContext(
  project: Project,
  options: ContinuityCheckContext = {},
): {
  chapter: Project["chapters"][number] | undefined;
  chapterOutline: ChapterOutline | undefined;
  recentContent: string;
} {
  const chapter = options.chapterId
    ? project.chapters.find((candidate) => candidate.id === options.chapterId)
    : undefined;
  const chapterOutline = resolveChapterOutlineForChapter(
    chapter,
    project.storyBible?.chapterOutlines,
  );

  const chapterTail = chapter?.content
    ? htmlToPlainText((chapter.content || "").slice(-3000))
    : "";
  const outlineFallback = chapterOutline
    ? [
        chapterOutline.title || "",
        chapterOutline.summary || "",
        ...(chapterOutline.beats || []).slice(0, 3),
      ]
        .filter(Boolean)
        .join("\n")
    : "";

  const recentContent =
    (options.recentContent || "").trim() ||
    chapterTail.trim() ||
    outlineFallback.trim() ||
    htmlToPlainText((project.content || "").slice(-3000)).trim();

  return {
    chapter,
    chapterOutline,
    recentContent: recentContent.slice(-3000),
  };
}

async function checkContinuity(
  newText: string,
  project: Project,
  options: ContinuityCheckContext = {},
): Promise<{
  issues: {
    type: string;
    description: string;
    severity: string;
    fixable: "text" | "bible" | "author";
  }[];
  score: number;
}> {
  if (!project.storyBible) {
    return { issues: [], score: 1.0 };
  }

  if (newText.length < 200) {
    return { issues: [], score: 1.0 };
  }

  // Check cache
  const checkHash = hashContent(
    newText +
      project.id +
      (options.chapterId || "") +
      (options.recentContent || ""),
  );
  const cached = caches.qualityScores.get("continuity_" + checkHash);
  if (
    cached &&
    Date.now() - cached.timestamp < CONFIG.CONTINUITY_CACHE_TTL_MS
  ) {
    logger.debug("Using cached continuity check");
    return cached.data as ContinuityCheckResult;
  }

  const contLog = createLogger("continuity");
  contLog.info("Running 5 structured passes in parallel...");
  const continuityContext = resolveContinuityContext(project, options);

  // Phase 1: Run POV extraction + 4 non-voice passes in parallel
  const [
    povResult,
    rosterResult,
    factResult,
    timelineResult,
    relationshipResult,
  ] = await Promise.allSettled([
    options.povCharacterName
      ? Promise.resolve(options.povCharacterName)
      : extractNarrativeState(newText).then((ns) => ns.povCharacter),
    runSceneRosterCheck(newText, project),
    runFactContinuityCheck(newText, project, continuityContext),
    runTimelineSpatialCheck(newText, project, continuityContext),
    runRelationshipStateCheck(newText, project),
  ]);

  // Resolve POV character name
  const resolvedPov =
    povResult.status === "fulfilled" ? povResult.value : "unknown";
  contLog.info(`POV character: ${resolvedPov}`);

  // Phase 2: Voice check with resolved POV (also wrapped for consistency)
  const voiceSettled = await Promise.allSettled([
    runVoiceConsistencyCheck(newText, project, resolvedPov),
  ]);

  // Collect all pass results, log any rejections
  const passes: PassResult[] = [];
  const allSettled = [
    ...voiceSettled,
    rosterResult,
    factResult,
    timelineResult,
    relationshipResult,
  ];
  const passNames = [
    "voice_consistency",
    "scene_roster",
    "fact_continuity",
    "timeline_spatial",
    "relationship_state",
  ];
  for (let i = 0; i < allSettled.length; i++) {
    const r = allSettled[i];
    if (r.status === "fulfilled") {
      passes.push(r.value);
    } else {
      contLog.error(`Pass "${passNames[i]}" rejected unexpectedly`, {
        reason: String(r.reason),
      });
    }
  }

  // Log each pass
  for (const p of passes) {
    const icon = p.pass ? "PASS" : p.errored ? "ERR " : "FAIL";
    contLog.info(
      `  [${icon}] ${p.check}: ${p.violations.length} violations (weight ${p.weight})`,
    );
    for (const v of p.violations) {
      contLog.warn(
        `    ${v.severity}: ${v.type} — ${v.description}${v.fix ? ` | fix: ${v.fix}` : ""}`,
      );
    }
  }

  // Weighted score — errored passes penalize slightly (0.5 credit) instead of full pass
  const totalWeight = passes.reduce((sum, p) => sum + p.weight, 0);
  const weightedScore =
    totalWeight > 0
      ? passes.reduce((sum, p) => {
          if (p.errored) return sum + p.weight * 0.5;
          if (p.pass) return sum + p.weight;
          return sum + p.weight * Math.max(0, 1 - p.violations.length * 0.15);
        }, 0) / totalWeight
      : 1.0;

  const allViolations = passes.flatMap((p) => p.violations);
  const score = Math.round(weightedScore * 100) / 100;

  contLog.info(
    `Aggregate: ${score} (${allViolations.length} violations from ${passes.length}/5 passes)`,
  );

  const finalResult = {
    issues: allViolations.map((v) => ({
      type: `${v.check}/${v.type}`,
      description: v.description + (v.fix ? ` Fix: ${v.fix}` : ""),
      severity: v.severity,
      fixable: v.fixable,
    })),
    score,
  };

  // Cache
  caches.qualityScores.set("continuity_" + checkHash, {
    hash: checkHash,
    data: finalResult,
    timestamp: Date.now(),
  });

  return finalResult;
}

// ============================================================================
// QUALITY SCORER - Anti-averaging system
// ============================================================================

async function scoreQuality(
  text: string,
  context: string,
  storyBibleContext?: string,
): Promise<{
  score: number;
  breakdown: Record<string, number>;
  feedback: string;
  violations?: string[];
}> {
  // Check cache first
  const scoreHash = hashContent(text);
  const cached = caches.qualityScores.get("quality_" + scoreHash);
  if (cached && Date.now() - cached.timestamp < CONFIG.QUALITY_CACHE_TTL_MS) {
    logger.debug("Using cached quality score");
    return cached.data as QualityScoreResult;
  }

  let responseText = "";
  try {
    ({ text: responseText } = await chatCompletion(
      "You are a writing quality evaluator. Respond only with valid JSON.",
      `Rate this generated text for quality on multiple dimensions.

CONTEXT:
${context.slice(-TOKEN_LIMITS.QUALITY_SCORING.input)}

STORY BIBLE QUALITY CONTEXT (for tone/voice alignment):
${storyBibleContext ? storyBibleContext : "N/A"}

GENERATED TEXT:
${text}

ALSO CHECK FOR THESE VIOLATIONS (penalize if found):
- Telegraphing phrases: "little did they know", "what they didn't realize", "unbeknownst to them", "this was ironic", "if only they had known"
- Over-explained irony: stating the irony explicitly instead of letting reader infer
- Homogeneous character voice: all characters thinking in the same analytical/operational framework
- Single-note emotional register: every paragraph landing in the same pressure or affect without modulation
- Repetitive sentence openings or recycled structural/image scaffolding

Return JSON:
{
  "overall": number 0-1,
  "breakdown": {
    "coherence": number 0-1,
    "style_match": number 0-1,
    "engagement": number 0-1,
    "originality": number 0-1,
    "flow": number 0-1,
    "subtlety": number 0-1,
    "voice_distinction": number 0-1
  },
  "violations": ["list any telegraphing phrases or over-explanations found"],
  "feedback": "one sentence of constructive feedback"
}

Return ONLY JSON.`,
      { maxTokens: 4000 },
    ));

    const result = JSON.parse(extractJSON(responseText));

    // Local check for common telegraphing phrases
    const telegraphPatterns = [
      /little did (they|he|she|we) know/gi,
      /what (they|he|she|we) didn't realize/gi,
      /unbeknownst to (them|him|her|us)/gi,
      /this was ironic/gi,
      /if only (they|he|she|we) had known/gi,
      /the irony (was|being) that/gi,
    ];
    const localViolations: string[] = [];
    for (const pattern of telegraphPatterns) {
      const matches = text.match(pattern);
      if (matches) {
        localViolations.push(...matches.map((m) => `Found: "${m}"`));
      }
    }

    // Local repetition detector — catches obvious looped constructions within same output
    const sentences = text
      .split(/[.!?]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 20);
    // Extract longer n-grams to avoid flagging normal connective phrasing.
    const ngramCounts = new Map<string, number>();
    for (const sentence of sentences) {
      const words = sentence
        .toLowerCase()
        .replace(/[""''—,;:]/g, "")
        .split(/\s+/)
        .filter(Boolean);
      for (let i = 0; i <= words.length - 8; i++) {
        const gram = words.slice(i, i + 8).join(" ");
        ngramCounts.set(gram, (ngramCounts.get(gram) || 0) + 1);
      }
    }
    const repeatedNgrams = [...ngramCounts.entries()]
      .filter(([, count]) => count >= 3)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);
    for (const [gram, count] of repeatedNgrams) {
      localViolations.push(`Repeated construction (${count}x): "${gram}"`);
    }
    // Structural repetition: "the X of someone who'd once Y" pattern and similar templates
    const structuralPatterns = new Map<string, string[]>();
    for (const sentence of sentences) {
      // Normalize to skeleton: replace nouns/adjectives with slots, keep structure words
      const skeleton = sentence
        .toLowerCase()
        .replace(/[""''—]/g, "")
        .replace(
          /\b(the|a|an|of|who|that|had|was|were|once|and|but|in|on|at|for|with|like|as)\b/g,
          (m) => m,
        )
        .replace(/\b[a-z]{6,}\b/g, "_") // Replace long words with slot
        .replace(/_(\s+_)+/g, "_") // Collapse consecutive slots
        .trim();
      if (skeleton.length > 30) {
        const existing = structuralPatterns.get(skeleton);
        if (existing) {
          existing.push(sentence.slice(0, 60));
        } else {
          structuralPatterns.set(skeleton, [sentence.slice(0, 60)]);
        }
      }
    }
    for (const [, matches] of structuralPatterns) {
      if (matches.length >= 3) {
        localViolations.push(
          `Structural repetition: "${matches[0]}..." reused ${matches.length}x with word swaps`,
        );
      }
    }

    const normalizedModelViolations = Array.isArray(result.violations)
      ? result.violations
          .map((value: unknown) =>
            typeof value === "string" ? value.trim() : "",
          )
          .filter((value: string) => {
            if (!value) return false;
            const normalized = value.toLowerCase();
            return ![
              "none",
              "n/a",
              "no violations",
              "no violation",
              "no telegraphing phrases detected",
              "no over-explanations found",
              "no over explanation found",
            ].includes(normalized);
          })
      : [];

    // Penalize if violations found
    let adjustedScore = result.overall ?? 0.7;
    const allViolations = [...normalizedModelViolations, ...localViolations];
    if (allViolations.length > 0) {
      const scorePenalty = Math.min(0.35, allViolations.length * 0.04);
      adjustedScore = Math.max(0.3, adjustedScore - scorePenalty);
      logger.warn("Quality violations found", {
        violations: allViolations,
        scorePenalty,
      });
    }

    const finalResult = {
      score: adjustedScore,
      breakdown: result.breakdown || {},
      feedback: result.feedback || "",
      violations: allViolations,
    };

    // Cache the result
    caches.qualityScores.set("quality_" + scoreHash, {
      hash: scoreHash,
      data: finalResult,
      timestamp: Date.now(),
    });

    return finalResult;
  } catch (e) {
    logger.error("Quality scoring error", {
      error: String(e),
      raw: responseText?.slice(0, 200),
    });
    return { score: 0.7, breakdown: {}, feedback: "" };
  }
}

registerProviderRoutes(app, {
  chatCompletion,
  getCodexAuthStatus,
  getProviderConfig: getCurrentProviderConfig,
  getProviderProfile: (type: ProviderType) => resolveProviderForType(type),
  saveProviderConfig,
  trackRequest,
});

// ============================================================================
// API ROUTES - Generation
// ============================================================================

registerGenerationRoutes(app, {
  buildGenerationContext,
  buildScenePromptPlan,
  chatCompletion,
  checkContinuity,
  config: CONFIG,
  db,
  createLogger,
  extractNarrativeState,
  getPromptPlanHistory: (projectId, chapterId, limit) => {
    let records = [...scenePromptPlans];
    if (projectId)
      records = records.filter((record) => record.projectId === projectId);
    if (chapterId)
      records = records.filter((record) => record.chapterId === chapterId);
    return records
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  },
  getProviderConfig: getCurrentProviderConfig,
  getUserPreferences: () => userPreferences,
  lifetimeMemory,
  logger,
  persistLifetimeMemory,
  projects,
  scoreQuality,
  tokenLimits: {
    MAIN_GENERATION: TOKEN_LIMITS.MAIN_GENERATION,
    RETRY_GENERATION: TOKEN_LIMITS.RETRY_GENERATION,
  },
  trackLatency,
  trackQualityScore,
  trackRequest,
  trackTokens,
  updateContinuityIndex,
});

// ============================================================================
// API ROUTES - Projects
// ============================================================================

registerProjectRoutes(app, {
  db,
  getLifetimeMemory: () => lifetimeMemory,
  logger,
  persistLifetimeMemory,
  persistProjects,
  projects,
  refreshLifetimeInsights,
  trackRequest,
});

// ============================================================================
// API ROUTES - Story Bible
// ============================================================================

registerStoryBibleRoutes(app, {
  chatCompletion,
  config: CONFIG,
  createLogger,
  extractJSON,
  getStoryBibleModel: () => {
    const model = userPreferences.generationSettings.storyBibleModel?.trim();
    return model || undefined;
  },
  getStoryBibleProvider: (model?: string) =>
    resolveProviderPreference(
      userPreferences.generationSettings.storyBibleProvider,
      model ? { model } : {},
    ),
  logger,
  persistProjects,
  projects,
  tokenLimits: {
    STORY_BIBLE_EXTRACT: TOKEN_LIMITS.STORY_BIBLE_EXTRACT,
  },
  trackExtraction,
  trackRequest,
});

// ============================================================================
// API ROUTES - Style Learning
// ============================================================================

app.get("/api/style", (_req: Request, res: Response) => {
  res.json({
    fingerprint: userPreferences.styleFingerprint,
    sampleCount: userPreferences.styleFingerprint?.sampleCount || 0,
  });
});

app.post("/api/style/samples", async (req: Request, res: Response) => {
  try {
    const { sample } = req.body;

    if (!sample || typeof sample !== "string") {
      return res.status(400).json({ error: "Sample must be a string" });
    }
    if (sample.length < CONFIG.MIN_EXTRACTION_CHARS) {
      return res.status(400).json({
        error: `Sample must be at least ${CONFIG.MIN_EXTRACTION_CHARS} characters`,
      });
    }
    if (sample.length > CONFIG.MAX_SAMPLE_CHARS) {
      return res.status(400).json({
        error: `Sample cannot exceed ${CONFIG.MAX_SAMPLE_CHARS} characters`,
      });
    }

    const analysis = await analyzeWritingSample(sample);
    userPreferences.styleFingerprint = aggregateStyleFingerprint(
      userPreferences.styleFingerprint,
      analysis,
      sample,
    );

    persistPreferences();

    res.json({
      fingerprint: userPreferences.styleFingerprint,
      analysis,
    });
  } catch (error) {
    logger.error("Style sample analysis error", { error: String(error) });
    res.status(500).json({ error: String(error) });
  }
});

app.delete("/api/style", (_req: Request, res: Response) => {
  userPreferences.styleFingerprint = null;
  persistPreferences();
  res.json({ reset: true });
});

app.post("/api/style/feedback", (req: Request, res: Response) => {
  const { generatedText, feedback, reason, projectId } = req.body;

  // Input validation
  if (!generatedText || typeof generatedText !== "string") {
    return res
      .status(400)
      .json({ error: "generatedText must be a non-empty string" });
  }
  if (!feedback || typeof feedback !== "string") {
    return res
      .status(400)
      .json({ error: "feedback must be a non-empty string" });
  }
  if (feedback !== "accept" && feedback !== "reject") {
    return res
      .status(400)
      .json({ error: 'feedback must be "accept" or "reject"' });
  }
  if (reason !== undefined && typeof reason !== "string") {
    return res.status(400).json({ error: "reason must be a string" });
  }
  if (projectId !== undefined && typeof projectId !== "string") {
    return res.status(400).json({ error: "projectId must be a string" });
  }

  lifetimeMemory.feedbackHistory.push({
    generatedText: generatedText.slice(0, CONFIG.MAX_FEEDBACK_TEXT_CHARS),
    feedback,
    reason: reason || "",
    timestamp: new Date().toISOString(),
  });

  persistLifetimeMemory();

  // Extract patterns from feedback to improve future generations
  extractPatternsFromFeedback();
  learnFromFeedback(generatedText, reason || feedback, feedback === "accept");
  if (projectId && reason) {
    recordProjectPreference({
      memory: lifetimeMemory,
      projectId,
      content: reason,
      source: feedback === "accept" ? "feedback-positive" : "feedback-negative",
      strength: feedback === "accept" ? 0.76 : 0.7,
    });
    refreshLifetimeInsights();
  }

  res.json({ recorded: true });
});

// ============================================================================
// API ROUTES - Cache Management
// ============================================================================

app.get("/api/cache/stats", (_req: Request, res: Response) => {
  res.json({
    storyBible: {
      entries: caches.storyBible.size,
      keys: [...caches.storyBible.keys()],
    },
    narrativeState: {
      entries: caches.narrativeState.size,
      keys: [...caches.narrativeState.keys()],
    },
    qualityScores: {
      entries: caches.qualityScores.size,
    },
    continuityIndex: {
      entries: caches.continuityIndex.size,
      keys: [...caches.continuityIndex.keys()],
    },
    styleAnalysis: {
      entries: caches.styleAnalysis.size,
    },
  });
});

app.post("/api/cache/clear", (req: Request, res: Response) => {
  const { cache } = req.body;

  if (cache === "all" || !cache) {
    caches.storyBible.clear();
    caches.narrativeState.clear();
    caches.qualityScores.clear();
    caches.continuityIndex.clear();
    caches.styleAnalysis.clear();
    logger.info("All caches cleared");
    return res.json({ cleared: "all" });
  }

  if (cache === "storyBible") caches.storyBible.clear();
  else if (cache === "narrativeState") caches.narrativeState.clear();
  else if (cache === "qualityScores") caches.qualityScores.clear();
  else if (cache === "continuityIndex") caches.continuityIndex.clear();
  else if (cache === "styleAnalysis") caches.styleAnalysis.clear();
  else return res.status(400).json({ error: "Unknown cache type" });

  logger.info("Cache cleared", { cache });
  res.json({ cleared: cache });
});

// ============================================================================
// API ROUTES - User Preferences
// ============================================================================

app.get("/api/preferences", (_req: Request, res: Response) => {
  res.json(serializePreferencesForClient(userPreferences));
});

app.put("/api/preferences", (req: Request, res: Response) => {
  const nextPreferences = mergePreferencesFromPayload(
    userPreferences,
    req.body,
    {
      maxOneShotTargetWords: CONFIG.MAX_ONE_SHOT_TARGET_WORDS,
      maxContextWindowChars: TOKEN_LIMITS.MAIN_GENERATION.input,
    },
  );

  userPreferences.styleFingerprint = nextPreferences.styleFingerprint;
  userPreferences.generationSettings = nextPreferences.generationSettings;
  userPreferences.memorySettings = nextPreferences.memorySettings;
  userPreferences.qualitySettings = nextPreferences.qualitySettings;
  userPreferences.uiPreferences = nextPreferences.uiPreferences;

  persistPreferences();
  res.json(serializePreferencesForClient(userPreferences));
});

// ============================================================================
// API ROUTES - Craft Patterns & Lifetime Memory
// ============================================================================

app.get("/api/craft-patterns", (_req: Request, res: Response) => {
  res.json(craftPatterns);
});

app.post("/api/craft-patterns", (req: Request, res: Response) => {
  const pattern: CraftPattern = {
    id: crypto.randomUUID(),
    category: req.body.category || "general",
    pattern: req.body.pattern,
    example: req.body.example || "",
    effectiveness: req.body.effectiveness || 0.5,
  };

  craftPatterns.push(pattern);
  persistCraftPatterns();

  res.json(pattern);
});

app.delete("/api/craft-patterns", (_req: Request, res: Response) => {
  craftPatterns = [];
  persistCraftPatterns();
  res.json({ cleared: true });
});

app.get("/api/lifetime-memory", (_req: Request, res: Response) => {
  const layers = buildFourLayerMemorySummary({
    craftPatterns,
    lifetimeMemory,
    scenePromptPlans,
    styleFingerprint: userPreferences.styleFingerprint,
    userPreferences,
  });
  res.json({
    totalGenerations: lifetimeMemory.writingHistory.length,
    totalFeedback: lifetimeMemory.feedbackHistory.length,
    insightsCount: lifetimeMemory.insights.length,
    projectMemoryCount: lifetimeMemory.projectMemories.length,
    layers,
  });
});

app.delete("/api/lifetime-memory", (_req: Request, res: Response) => {
  lifetimeMemory = {
    insights: [],
    writingHistory: [],
    feedbackHistory: [],
    projectMemories: [],
  };
  persistLifetimeMemory();
  res.json({ cleared: true });
});

app.get("/api/memory/stats", (_req: Request, res: Response) => {
  const totalWords = lifetimeMemory.writingHistory.reduce(
    (sum, h) => sum + h.wordsWritten,
    0,
  );
  const layers = buildFourLayerMemorySummary({
    craftPatterns,
    lifetimeMemory,
    scenePromptPlans,
    styleFingerprint: userPreferences.styleFingerprint,
    userPreferences,
  });
  res.json({
    totalWordsGenerated: totalWords,
    sessionsCount: lifetimeMemory.writingHistory.length,
    feedbackCount: lifetimeMemory.feedbackHistory.length,
    insightsCount: lifetimeMemory.insights.length,
    projectMemoryCount: lifetimeMemory.projectMemories.length,
    layers,
  });
});

// ============================================================================
// API ROUTES - Autonomous Writing
// ============================================================================

const autonomousSessions = new Map<string, AutonomousSession>();

// In-memory controllers to allow aborting in-flight provider requests per session
const sessionControllers = new Map<string, AbortController>();

// Persist sessions to disk so they survive restarts
const SESSIONS_FILE = path.join(DATA_DIR, "sessions.json");

function persistSessions(): void {
  const sessionsObj = Object.fromEntries(autonomousSessions.entries());
  fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessionsObj, null, 2));
}

function loadSessions(): void {
  if (fs.existsSync(SESSIONS_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(SESSIONS_FILE, "utf-8"));
      for (const [id, session] of Object.entries(data)) {
        // Only restore running/paused sessions
        const s = {
          autoAccept: false,
          autoIterate: true,
          selectedThreads: [],
          ...(session as Partial<AutonomousSession>),
        } as AutonomousSession;
        if (s.status === "running" || s.status === "paused") {
          autonomousSessions.set(id, s);
          logger.info("Restored session", { sessionId: id, status: s.status });
        }
      }
      logger.info(`Loaded ${autonomousSessions.size} active sessions`);
    } catch (e) {
      logger.error("Failed to load sessions", e);
    }
  }
}

// Load sessions on startup
loadSessions();

// Session cleanup - prevent memory leak
function cleanupExpiredSessions(): void {
  const now = Date.now();
  for (const [id, session] of autonomousSessions.entries()) {
    const sessionAge = now - new Date(session.startedAt).getTime();
    const isExpired = sessionAge > CONFIG.SESSION_TTL_MS;
    const isTerminal =
      session.status === "completed" || session.status === "stopped";

    // Remove if expired or terminal and older than 1 hour
    if (
      isExpired ||
      (isTerminal && sessionAge > CONFIG.CONTINUITY_CACHE_TTL_MS)
    ) {
      autonomousSessions.delete(id);
      logger.info("Cleaned up session", {
        sessionId: id,
        status: session.status,
        ageMs: sessionAge,
      });
    }
  }
}

// Run cleanup every hour
setInterval(cleanupExpiredSessions, CONFIG.SESSION_CLEANUP_INTERVAL_MS);

registerAutonomousRoutes(app, {
  buildGenerationContext,
  chatCompletion,
  checkContinuity,
  db,
  extractNarrativeState,
  getAutonomousSessions: () => autonomousSessions,
  getProjects: () => projects,
  getSessionControllers: () => sessionControllers,
  getUserPreferences: () => userPreferences,
  persistProjects,
  persistSessions,
  polishText,
  scoreQuality,
  trackRequest,
  trackTokens,
  updateContinuityIndex,
});

registerAuthorExportRoutes(app, {
  trackRequest,
});

registerProductionClient(app);

// ============================================================================
// STARTUP INITIALIZATION
// ============================================================================

function initializeOnStartup(): void {
  refreshLifetimeInsights();

  // Extract patterns from existing feedback history
  if (lifetimeMemory.feedbackHistory.length > 0) {
    logger.info("Extracting patterns from feedback history...");
    extractPatternsFromFeedback();
  }

  // Add built-in craft patterns if not already present
  const builtInPatterns = [
    {
      id: "builtin-structural-variation",
      category: "structure",
      pattern:
        "Vary scene endings: use silence, action, environmental shift, or unresolved tension - not just punchy revelations",
      example:
        'Instead of ending with a revelation, try: "The door closed. The sound lingered." or "She walked away without speaking."',
      effectiveness: 0.9,
    },
    {
      id: "builtin-show-dont-label",
      category: "subtlety",
      pattern:
        "Never explain irony or label emotional outcomes. Let reader infer meaning from context, juxtaposition, or silence.",
      example:
        'Instead of "The blast doors locked them out instead of locking danger in" → "The doors hissed shut. Outside, wind howled. Inside, lights flickered. No one moved."',
      effectiveness: 0.95,
    },
    {
      id: "builtin-avoid-telegraph",
      category: "subtlety",
      pattern:
        'Avoid telegraphing phrases: "little did they know", "what they didn\'t realize", "unbeknownst to them", "this was ironic"',
      example:
        "Delete the phrase entirely. Trust the reader to see the irony from the situation itself.",
      effectiveness: 0.9,
    },
    {
      id: "builtin-voice-divergence",
      category: "character",
      pattern:
        "Each character must think in their own cognitive mode. Analytical characters use logic; emotional characters use sensation; instinctive characters react without reasoning.",
      example:
        'An emotional character thinks: "Her chest tightened. Something was wrong." NOT: "She assessed the threat vectors."',
      effectiveness: 0.75,
    },
  ];

  const existingIds = new Set(craftPatterns.map((p) => p.id));
  let added = 0;
  for (const pattern of builtInPatterns) {
    if (!existingIds.has(pattern.id)) {
      craftPatterns.push(pattern);
      added++;
    }
  }
  if (added > 0) {
    persistCraftPatterns();
    logger.info("Added built-in craft patterns", { count: added });
  }

  // Log cache status
  logger.info("Cache layer initialized", {
    storyBibleCache: caches.storyBible.size,
    narrativeStateCache: caches.narrativeState.size,
    qualityScoresCache: caches.qualityScores.size,
    continuityIndexCache: caches.continuityIndex.size,
    styleAnalysisCache: caches.styleAnalysis.size,
  });
}

// ============================================================================
// START SERVER
// ============================================================================

const ANSI = {
  bold: "\x1b[1m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
  dim: "\x1b[2m",
  reset: "\x1b[0m",
};

const STARTUP_BANNER = [
  "╔──────────────────────────────────────────────────────────╗",
  "│███╗   ███╗ █████╗  ██████╗ ███╗   ██╗██╗   ██╗███╗   ███╗│",
  "│████╗ ████║██╔══██╗██╔════╝ ████╗  ██║██║   ██║████╗ ████║│",
  "│██╔████╔██║███████║██║  ███╗██╔██╗ ██║██║   ██║██╔████╔██║│",
  "│██║╚██╔╝██║██╔══██║██║   ██║██║╚██╗██║██║   ██║██║╚██╔╝██║│",
  "│██║ ╚═╝ ██║██║  ██║╚██████╔╝██║ ╚████║╚██████╔╝██║ ╚═╝ ██║│",
  "│╚═╝     ╚═╝╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═══╝ ╚═════╝ ╚═╝     ╚═╝│",
  "│ ██████╗ ██████╗ ██╗   ██╗███████╗                        │",
  "│██╔═══██╗██╔══██╗██║   ██║██╔════╝                        │",
  "│██║   ██║██████╔╝██║   ██║███████╗                        │",
  "│██║   ██║██╔═══╝ ██║   ██║╚════██║                        │",
  "│╚██████╔╝██║     ╚██████╔╝███████║                        │",
  "│ ╚═════╝ ╚═╝      ╚═════╝ ╚══════╝                        │",
  "│                                 Slayer of the blank page.│",
  "╚──────────────────────────────────────────────────────────╝",
];

function printStartupBanner(): void {
  console.log("");
  for (const line of STARTUP_BANNER) {
    console.log(`${ANSI.bold}${ANSI.cyan}${line}${ANSI.reset}`);
  }
  console.log("");
}

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  // Run startup initialization
  initializeOnStartup();
  printStartupBanner();
  console.log(`  Server: http://localhost:${PORT}`);
  console.log("");
  console.log("  Current Provider:");
  console.log(`    Type:  ${providerConfig.type}`);
  console.log(`    Model: ${providerConfig.model}`);
  console.log(
    `    Key:   ${providerConfig.type === "codex" ? "ChatGPT Login" : providerConfig.apiKey ? "Configured" : "NOT SET"}`,
  );
  if (providerConfig.baseUrl) {
    console.log(`    URL:   ${providerConfig.baseUrl}`);
  }
  console.log("");
  console.log("  Supported Providers:");
  console.log("  ─────────────────────────────────────────────────────");
  console.log(
    "  CODEX / ChatGPT            Local Codex login (subscription auth)",
  );
  console.log("  GROQ_API_KEY               Groq (Llama, Mixtral)");
  console.log("  OPENAI_API_KEY             OpenAI (GPT-4, etc.)");
  console.log("  OPENAI_COMPATIBLE_API_KEY  Any OpenAI-compatible API");
  console.log("    + OPENAI_COMPATIBLE_BASE_URL (e.g., Ollama, LMStudio)");
  console.log("  AI_MODEL                   Override default model");
  console.log("");
  console.log("  Or configure via: PUT /api/provider");
  console.log("");
  console.log(`  Projects: ${projects.size}`);
  console.log(
    `  Style Fingerprint: ${userPreferences.styleFingerprint ? "Yes" : "No"}`,
  );
  console.log("");
  console.log("  Press Ctrl+C to stop");
  console.log("");
});

// ============================================================================
// GRACEFUL SHUTDOWN - Handle Ctrl+C and other termination signals
// ============================================================================

function shutdown(signal: string): void {
  console.log(`\n${signal} received. Shutting down...`);

  // Close database connection
  try {
    db.closeDb();
    console.log("Database closed.");
  } catch {
    // Ignore errors on close
  }

  // Force exit
  process.exit(0);
}

// Handle Ctrl+C
process.on("SIGINT", () => shutdown("SIGINT"));

// Handle kill command
process.on("SIGTERM", () => shutdown("SIGTERM"));

// Handle uncaught exceptions
process.on("uncaughtException", (err) => {
  // Sanitize error before logging to prevent leaking sensitive data
  const safeError = {
    name: err.name,
    message: err.message,
    stack: err.stack,
  };
  console.error("Uncaught exception:", sanitizeForLogging(safeError));
  shutdown("uncaughtException");
});

// Handle unhandled promise rejections
process.on("unhandledRejection", (reason, _promise) => {
  // Sanitize rejection reason to prevent leaking sensitive data
  const safeReason =
    typeof reason === "object" && reason !== null
      ? sanitizeForLogging(reason)
      : reason;
  console.error("Unhandled rejection at:", "Promise", "reason:", safeReason);
});
