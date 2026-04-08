import type { UserPreferences } from "../../domain/types.js";

export interface FlatPreferences {
  temperature: number;
  topP: number;
  frequencyPenalty: number;
  presencePenalty: number;
  targetWords: number;
  enablePromptPlanner: boolean;
  promptPlannerEmbeddingProvider: UserPreferences["generationSettings"]["promptPlannerEmbeddingProvider"];
  promptPlannerEmbeddingModel: string;
  promptPlannerProvider: UserPreferences["generationSettings"]["promptPlannerProvider"];
  promptPlannerModel: string;
  storyBibleProvider: UserPreferences["generationSettings"]["storyBibleProvider"];
  storyBibleModel: string;
  promptPlannerTopK: number;
  promptPlannerFallbackMode: UserPreferences["generationSettings"]["promptPlannerFallbackMode"];
  showQualityScores: boolean;
  minQualityThreshold: number;
  enableContinuityChecks: boolean;
  preferredPOV: string;
  preferredTense: string;
  contextWindowSize: number;
  persistentDirections: string;
}

export type PreferencesResponse = UserPreferences & FlatPreferences;

interface FlatPreferenceLimits {
  maxOneShotTargetWords: number;
  maxContextWindowChars: number;
}

const PROVIDER_PREFERENCES = new Set<
  UserPreferences["generationSettings"]["promptPlannerProvider"]
>([
  "main",
  "codex",
  "groq",
  "openai",
  "openai-compatible",
  "anthropic",
  "google",
  "ollama",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeProviderPreference(
  value: string,
): UserPreferences["generationSettings"]["promptPlannerProvider"] {
  return PROVIDER_PREFERENCES.has(
    value as UserPreferences["generationSettings"]["promptPlannerProvider"],
  )
    ? (value as UserPreferences["generationSettings"]["promptPlannerProvider"])
    : "main";
}

export function serializePreferencesForClient(
  userPreferences: UserPreferences,
): PreferencesResponse {
  return {
    ...userPreferences,
    temperature: userPreferences.generationSettings.defaultTemperature,
    topP: userPreferences.generationSettings.defaultTopP,
    frequencyPenalty:
      userPreferences.generationSettings.defaultFrequencyPenalty,
    presencePenalty: userPreferences.generationSettings.defaultPresencePenalty,
    targetWords: userPreferences.generationSettings.defaultTargetWords,
    enablePromptPlanner: userPreferences.generationSettings.enablePromptPlanner,
    promptPlannerEmbeddingProvider:
      userPreferences.generationSettings.promptPlannerEmbeddingProvider,
    promptPlannerEmbeddingModel:
      userPreferences.generationSettings.promptPlannerEmbeddingModel,
    promptPlannerProvider:
      userPreferences.generationSettings.promptPlannerProvider,
    promptPlannerModel: userPreferences.generationSettings.promptPlannerModel,
    storyBibleProvider: userPreferences.generationSettings.storyBibleProvider,
    storyBibleModel: userPreferences.generationSettings.storyBibleModel,
    promptPlannerTopK: userPreferences.generationSettings.promptPlannerTopK,
    promptPlannerFallbackMode:
      userPreferences.generationSettings.promptPlannerFallbackMode,
    showQualityScores: userPreferences.qualitySettings.showScores,
    minQualityThreshold: userPreferences.qualitySettings.minThreshold,
    enableContinuityChecks:
      userPreferences.memorySettings.enableContinuityChecks,
    preferredPOV: userPreferences.memorySettings.preferredPov,
    preferredTense: userPreferences.memorySettings.preferredTense,
    contextWindowSize: userPreferences.memorySettings.contextWindowSize,
    persistentDirections: userPreferences.memorySettings.persistentDirections,
  };
}

export function mergePreferencesFromPayload(
  current: UserPreferences,
  payload: unknown,
  limits: FlatPreferenceLimits,
): UserPreferences {
  const body = isRecord(payload) ? payload : {};
  const generationSettings = isRecord(body.generationSettings)
    ? body.generationSettings
    : {};
  const memorySettings = isRecord(body.memorySettings)
    ? body.memorySettings
    : {};
  const qualitySettings = isRecord(body.qualitySettings)
    ? body.qualitySettings
    : {};
  const uiPreferences = isRecord(body.uiPreferences) ? body.uiPreferences : {};

  const next: UserPreferences = {
    ...current,
    generationSettings: {
      ...current.generationSettings,
    },
    memorySettings: {
      ...current.memorySettings,
    },
    qualitySettings: {
      ...current.qualitySettings,
    },
    uiPreferences: {
      ...current.uiPreferences,
    },
  };

  if (typeof generationSettings.defaultTemperature === "number") {
    next.generationSettings.defaultTemperature =
      generationSettings.defaultTemperature;
  }
  if (typeof generationSettings.defaultTopP === "number") {
    next.generationSettings.defaultTopP = generationSettings.defaultTopP;
  }
  if (typeof generationSettings.defaultFrequencyPenalty === "number") {
    next.generationSettings.defaultFrequencyPenalty =
      generationSettings.defaultFrequencyPenalty;
  }
  if (typeof generationSettings.defaultPresencePenalty === "number") {
    next.generationSettings.defaultPresencePenalty =
      generationSettings.defaultPresencePenalty;
  }
  if (typeof generationSettings.defaultTargetWords === "number") {
    next.generationSettings.defaultTargetWords =
      generationSettings.defaultTargetWords;
  }
  if (typeof generationSettings.enablePromptPlanner === "boolean") {
    next.generationSettings.enablePromptPlanner =
      generationSettings.enablePromptPlanner;
  }
  if (typeof generationSettings.promptPlannerEmbeddingProvider === "string") {
    next.generationSettings.promptPlannerEmbeddingProvider =
      generationSettings.promptPlannerEmbeddingProvider as UserPreferences["generationSettings"]["promptPlannerEmbeddingProvider"];
  }
  if (typeof generationSettings.promptPlannerEmbeddingModel === "string") {
    next.generationSettings.promptPlannerEmbeddingModel =
      generationSettings.promptPlannerEmbeddingModel;
  }
  if (typeof generationSettings.promptPlannerProvider === "string") {
    next.generationSettings.promptPlannerProvider =
      generationSettings.promptPlannerProvider as UserPreferences["generationSettings"]["promptPlannerProvider"];
  }
  if (typeof generationSettings.promptPlannerModel === "string") {
    next.generationSettings.promptPlannerModel =
      generationSettings.promptPlannerModel;
  }
  if (typeof generationSettings.storyBibleProvider === "string") {
    next.generationSettings.storyBibleProvider =
      generationSettings.storyBibleProvider as UserPreferences["generationSettings"]["storyBibleProvider"];
  }
  if (typeof generationSettings.storyBibleModel === "string") {
    next.generationSettings.storyBibleModel =
      generationSettings.storyBibleModel;
  }
  if (typeof generationSettings.promptPlannerTopK === "number") {
    next.generationSettings.promptPlannerTopK =
      generationSettings.promptPlannerTopK;
  }
  if (typeof generationSettings.promptPlannerFallbackMode === "string") {
    next.generationSettings.promptPlannerFallbackMode =
      generationSettings.promptPlannerFallbackMode === "lexical"
        ? "lexical"
        : "error";
  }

  if (typeof body.temperature === "number") {
    next.generationSettings.defaultTemperature = body.temperature;
  }
  if (typeof body.topP === "number") {
    next.generationSettings.defaultTopP = body.topP;
  }
  if (typeof body.frequencyPenalty === "number") {
    next.generationSettings.defaultFrequencyPenalty = body.frequencyPenalty;
  }
  if (typeof body.presencePenalty === "number") {
    next.generationSettings.defaultPresencePenalty = body.presencePenalty;
  }
  if (typeof body.targetWords === "number") {
    next.generationSettings.defaultTargetWords = body.targetWords;
  }
  if (typeof body.enablePromptPlanner === "boolean") {
    next.generationSettings.enablePromptPlanner = body.enablePromptPlanner;
  }
  if (typeof body.promptPlannerEmbeddingProvider === "string") {
    next.generationSettings.promptPlannerEmbeddingProvider =
      body.promptPlannerEmbeddingProvider as UserPreferences["generationSettings"]["promptPlannerEmbeddingProvider"];
  }
  if (typeof body.promptPlannerEmbeddingModel === "string") {
    next.generationSettings.promptPlannerEmbeddingModel =
      body.promptPlannerEmbeddingModel;
  }
  if (typeof body.promptPlannerProvider === "string") {
    next.generationSettings.promptPlannerProvider =
      body.promptPlannerProvider as UserPreferences["generationSettings"]["promptPlannerProvider"];
  }
  if (typeof body.promptPlannerModel === "string") {
    next.generationSettings.promptPlannerModel = body.promptPlannerModel;
  }
  if (typeof body.storyBibleProvider === "string") {
    next.generationSettings.storyBibleProvider =
      body.storyBibleProvider as UserPreferences["generationSettings"]["storyBibleProvider"];
  }
  if (typeof body.storyBibleModel === "string") {
    next.generationSettings.storyBibleModel = body.storyBibleModel;
  }
  if (typeof body.promptPlannerTopK === "number") {
    next.generationSettings.promptPlannerTopK = body.promptPlannerTopK;
  }
  if (typeof body.promptPlannerFallbackMode === "string") {
    next.generationSettings.promptPlannerFallbackMode =
      body.promptPlannerFallbackMode === "lexical" ? "lexical" : "error";
  }

  if (typeof memorySettings.enableContinuityChecks === "boolean") {
    next.memorySettings.enableContinuityChecks =
      memorySettings.enableContinuityChecks;
  }
  if (typeof memorySettings.preferredPov === "string") {
    next.memorySettings.preferredPov = memorySettings.preferredPov;
  }
  if (typeof memorySettings.preferredTense === "string") {
    next.memorySettings.preferredTense = memorySettings.preferredTense;
  }
  if (typeof memorySettings.contextWindowSize === "number") {
    next.memorySettings.contextWindowSize = memorySettings.contextWindowSize;
  }
  if (typeof memorySettings.persistentDirections === "string") {
    next.memorySettings.persistentDirections =
      memorySettings.persistentDirections;
  }

  if (typeof body.enableContinuityChecks === "boolean") {
    next.memorySettings.enableContinuityChecks = body.enableContinuityChecks;
  }
  if (typeof body.preferredPOV === "string") {
    next.memorySettings.preferredPov = body.preferredPOV;
  }
  if (typeof body.preferredTense === "string") {
    next.memorySettings.preferredTense = body.preferredTense;
  }
  if (typeof body.contextWindowSize === "number") {
    next.memorySettings.contextWindowSize = body.contextWindowSize;
  }
  if (typeof body.persistentDirections === "string") {
    next.memorySettings.persistentDirections = body.persistentDirections;
  }

  if (typeof qualitySettings.showScores === "boolean") {
    next.qualitySettings.showScores = qualitySettings.showScores;
  }
  if (typeof qualitySettings.minThreshold === "number") {
    next.qualitySettings.minThreshold = qualitySettings.minThreshold;
  }

  if (typeof body.showQualityScores === "boolean") {
    next.qualitySettings.showScores = body.showQualityScores;
  }
  if (typeof body.minQualityThreshold === "number") {
    next.qualitySettings.minThreshold = body.minQualityThreshold;
  }

  if (typeof uiPreferences.theme === "string") {
    next.uiPreferences.theme = uiPreferences.theme;
  }
  if (typeof uiPreferences.fontSize === "number") {
    next.uiPreferences.fontSize = uiPreferences.fontSize;
  }
  if (typeof uiPreferences.showWordCount === "boolean") {
    next.uiPreferences.showWordCount = uiPreferences.showWordCount;
  }

  next.generationSettings.defaultTemperature = Math.max(
    0,
    Math.min(2, next.generationSettings.defaultTemperature),
  );
  next.generationSettings.defaultTopP = Math.max(
    0.1,
    Math.min(1, next.generationSettings.defaultTopP),
  );
  next.generationSettings.defaultFrequencyPenalty = Math.max(
    0,
    Math.min(2, next.generationSettings.defaultFrequencyPenalty),
  );
  next.generationSettings.defaultPresencePenalty = Math.max(
    -2,
    Math.min(2, next.generationSettings.defaultPresencePenalty),
  );
  next.generationSettings.defaultTargetWords = Math.max(
    50,
    Math.min(
      limits.maxOneShotTargetWords,
      next.generationSettings.defaultTargetWords,
    ),
  );
  next.generationSettings.promptPlannerTopK = Math.max(
    3,
    Math.min(20, next.generationSettings.promptPlannerTopK),
  );
  next.generationSettings.promptPlannerEmbeddingProvider =
    normalizeProviderPreference(
      next.generationSettings.promptPlannerEmbeddingProvider,
    );
  next.generationSettings.promptPlannerProvider = normalizeProviderPreference(
    next.generationSettings.promptPlannerProvider,
  );
  next.generationSettings.storyBibleProvider = normalizeProviderPreference(
    next.generationSettings.storyBibleProvider,
  );
  next.generationSettings.promptPlannerEmbeddingModel =
    next.generationSettings.promptPlannerEmbeddingModel.slice(0, 120);
  next.generationSettings.promptPlannerModel =
    next.generationSettings.promptPlannerModel.slice(0, 120);
  next.generationSettings.storyBibleModel =
    next.generationSettings.storyBibleModel.slice(0, 120);
  next.generationSettings.promptPlannerFallbackMode =
    next.generationSettings.promptPlannerFallbackMode === "lexical"
      ? "lexical"
      : "error";

  next.memorySettings.preferredPov = next.memorySettings.preferredPov.slice(
    0,
    80,
  );
  next.memorySettings.preferredTense = next.memorySettings.preferredTense.slice(
    0,
    80,
  );
  next.memorySettings.contextWindowSize = Math.max(
    2000,
    Math.min(
      limits.maxContextWindowChars,
      next.memorySettings.contextWindowSize,
    ),
  );
  next.memorySettings.persistentDirections =
    next.memorySettings.persistentDirections
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 12)
      .join("\n");

  next.qualitySettings.minThreshold = Math.max(
    1,
    Math.min(10, next.qualitySettings.minThreshold),
  );

  return next;
}
