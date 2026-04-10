export interface AppPreferences {
  temperature: number;
  topP: number;
  frequencyPenalty: number;
  presencePenalty: number;
  targetWords: number;
  showQualityScores: boolean;
  minQualityThreshold: number;
  enableContinuityChecks: boolean;
  preferredPOV: string;
  preferredTense: string;
  contextWindowSize: number;
  persistentDirections: string;
  enablePromptPlanner: boolean;
  promptPlannerEmbeddingProvider: string;
  promptPlannerEmbeddingModel: string;
  promptPlannerProvider: string;
  promptPlannerModel: string;
  storyBibleProvider: string;
  storyBibleModel: string;
  promptPlannerTopK: number;
  promptPlannerFallbackMode: "lexical" | "error";
}

export const DEFAULT_APP_PREFERENCES: AppPreferences = {
  temperature: 0.8,
  topP: 0.75,
  frequencyPenalty: 0.85,
  presencePenalty: -0.2,
  targetWords: 5000,
  showQualityScores: true,
  minQualityThreshold: 7,
  enableContinuityChecks: true,
  preferredPOV: "third-limited",
  preferredTense: "past",
  contextWindowSize: 10000,
  persistentDirections: "",
  enablePromptPlanner: true,
  promptPlannerEmbeddingProvider: "ollama",
  promptPlannerEmbeddingModel: "qwen3-embedding:0.6b",
  promptPlannerProvider: "ollama",
  promptPlannerModel: "qwen3:0.6b",
  storyBibleProvider: "main",
  storyBibleModel: "",
  promptPlannerTopK: 12,
  promptPlannerFallbackMode: "error",
};
