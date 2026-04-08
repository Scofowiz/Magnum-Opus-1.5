/**
 * Core Type Definitions
 *
 * Shared types used across the Magnum Opus application.
 * Following DDD principles with typed interfaces for all public APIs.
 */

// ============================================================================
// LOGGING TYPES
// ============================================================================

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  context: string;
  message: string;
  data?: unknown;
}

export interface Logger {
  debug(message: string, data?: unknown): void;
  info(message: string, data?: unknown): void;
  warn(message: string, data?: unknown): void;
  error(message: string, data?: unknown): void;
}

// ============================================================================
// METRICS TYPES
// ============================================================================

export interface TokenUsage {
  total: number;
  byEndpoint: Record<string, number>;
  byDay: Record<string, number>;
}

export interface QualityScoreEntry {
  timestamp: string;
  score: number;
  endpoint: string;
}

export interface LatencyEntry {
  timestamp: string;
  endpoint: string;
  durationMs: number;
}

export interface ExtractionEntry {
  timestamp: string;
  passesRun: number;
  charactersFound: number;
  newAdded: number;
  duplicatesSkipped: number;
  enriched: number;
}

export interface MetricsData {
  tokenUsage: TokenUsage;
  qualityScores: { history: QualityScoreEntry[] };
  latency: { requests: LatencyEntry[] };
  extraction: { iterations: ExtractionEntry[] };
  requestCounts: Record<string, number>;
  startedAt: string;
}

export type QualityTrend = "improving" | "stable" | "declining";

// ============================================================================
// PROVIDER TYPES
// ============================================================================

export type ProviderType =
  | "codex"
  | "groq"
  | "openai"
  | "openai-compatible"
  | "anthropic"
  | "google"
  | "ollama";

export interface ProviderConfig {
  type: ProviderType;
  apiKey: string;
  baseUrl?: string;
  model: string;
}

export interface ChatCompletionOptions {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
}

export interface ChatCompletionResult {
  text: string;
  tokens: number;
}

// ============================================================================
// PROJECT TYPES
// ============================================================================

export interface Project {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  storyBible?: StoryBible;
  chapters: Chapter[];
}

export interface Chapter {
  id: string;
  title: string;
  content: string;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface StoryBible {
  premise: string;
  characters: Character[];
  worldBuilding: string;
  plotStructure: PlotStructure;
  styleDirectives: string[];
  themes: string[];
}

export interface Character {
  id: string;
  name: string;
  description: string;
  role: "protagonist" | "antagonist" | "supporting" | "minor";
  traits: string[];
  relationships: CharacterRelationship[];
  arc?: string;
}

export interface CharacterRelationship {
  characterId: string;
  type: string;
  description: string;
}

export interface PlotStructure {
  acts: PlotAct[];
  plotBeats: PlotBeat[];
}

export interface PlotAct {
  number: number;
  name: string;
  description: string;
}

export interface PlotBeat {
  id: string;
  actNumber: number;
  name: string;
  description: string;
  completed: boolean;
}

// ============================================================================
// STYLE TYPES
// ============================================================================

export interface StyleFingerprint {
  voiceCharacteristics: string[];
  sentencePatterns: SentencePatterns;
  vocabularyLevel: "simple" | "moderate" | "complex";
  toneMarkers: string[];
  strengthsWeaknesses: StrengthsWeaknesses;
  samples: StyleSample[];
  feedbackHistory: StyleFeedback[];
}

export interface SentencePatterns {
  averageLength: number;
  variation: "low" | "medium" | "high";
  dialogueRatio: number;
  passiveVoiceRatio: number;
  adverbFrequency: number;
}

export interface StrengthsWeaknesses {
  strengths: string[];
  weaknesses: string[];
}

export interface StyleSample {
  id: string;
  text: string;
  analysis: StyleAnalysis;
  addedAt: string;
}

export interface StyleAnalysis {
  sentenceLength: number;
  dialogueRatio: number;
  passiveVoiceRatio: number;
  adverbFrequency: number;
  tone: string[];
  showVsTell: number;
  strengths: string[];
  weaknesses: string[];
}

export interface StyleFeedback {
  id: string;
  generatedText: string;
  feedbackType: "positive" | "negative" | "adjustment";
  notes: string;
  timestamp: string;
}

// ============================================================================
// AUTONOMOUS SESSION TYPES
// ============================================================================

export type SessionStatus =
  | "initializing"
  | "running"
  | "paused"
  | "completed"
  | "error"
  | "waiting_for_acceptance";

export interface AutonomousSession {
  id: string;
  projectId: string;
  chapterId: string;
  status: SessionStatus;
  targetWords: number;
  generatedWords: number;
  iterations: number;
  plotPointsToHit: string[];
  plotPointsAchieved: string[];
  currentContent: string;
  pendingContent?: string;
  history: SessionIteration[];
  createdAt: string;
  updatedAt: string;
  error?: string;
}

export interface SessionIteration {
  iteration: number;
  content: string;
  words: number;
  timestamp: string;
  qualityScore?: number;
}

// ============================================================================
// CACHE TYPES
// ============================================================================

export interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  createdAt: number;
}

export interface CacheStats {
  entries: number;
  hitRate: number;
  missRate: number;
  totalHits: number;
  totalMisses: number;
}

// ============================================================================
// HEALTH TYPES
// ============================================================================

export type HealthStatus = "healthy" | "degraded" | "unhealthy";

export interface HealthCheck {
  status: HealthStatus;
  uptime: number;
  timestamp: string;
  checks: HealthCheckResult[];
}

export interface HealthCheckResult {
  name: string;
  status: HealthStatus;
  message?: string;
  latency?: number;
}

// ============================================================================
// API RESPONSE TYPES
// ============================================================================

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: ApiError;
}

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}
