/**
 * Core Configuration Module
 *
 * Centralized configuration constants for the Magnum Opus application.
 * No magic numbers - all values are named and documented.
 */

export const CONFIG = {
  // Content limits
  MIN_EXTRACTION_CHARS: 1000,
  MAX_SAMPLE_CHARS: 20000,
  MAX_FEEDBACK_TEXT_CHARS: 50000,
  MAX_DESCRIPTION_SLICE: 10000,

  // Session management
  SESSION_TTL_MS: 24 * 60 * 60 * 1000, // 24 hours
  SESSION_CLEANUP_INTERVAL_MS: 60 * 60 * 1000, // 1 hour

  // Cache TTLs
  STYLE_CACHE_TTL_MS: 24 * 60 * 60 * 1000, // 24 hours
  CONTINUITY_CACHE_TTL_MS: 60 * 60 * 1000, // 1 hour
  QUALITY_CACHE_TTL_MS: 60 * 60 * 1000, // 1 hour

  // Generation defaults
  DEFAULT_WORDS_PER_ITERATION: 2000,
  DEFAULT_TARGET_WORDS: 5000,
  MAX_ONE_SHOT_TARGET_WORDS: 5000,
  AUTONOMOUS_MAX_WORDS_PER_ITERATION: 5000,
  AUTONOMOUS_MIN_CHAPTER_END_RATIO: 0.8,
  AUTONOMOUS_MIN_CHAPTER_END_FLOOR: 2500,

  // Health thresholds
  HEALTH_ERROR_THRESHOLD_UNHEALTHY: 100,
  HEALTH_ERROR_THRESHOLD_DEGRADED: 50,
  HEALTH_LATENCY_THRESHOLD_UNHEALTHY_MS: 25000,
  HEALTH_LATENCY_THRESHOLD_DEGRADED_MS: 15000,

  // Beat verification
  BEAT_KEYWORD_MATCH_THRESHOLD: 0.8,
} as const;

/**
 * Token limits per stage
 * Based on 262K context, 16K max completion
 */
export const TOKEN_LIMITS = {
  STYLE_ANALYSIS: { input: 60000, output: 16000 },
  MAIN_GENERATION: { input: 100000, output: 16000 },
  QUALITY_SCORING: { input: 60000, output: 4000 },
  CONTINUITY_CHECK: { input: 60000, output: 8000 },
  RETRY_GENERATION: { input: 75000, output: 16000 },
  AUTONOMOUS_ITERATE: { input: 75000, output: 16000 },
  NARRATIVE_STATE: { input: 30000, output: 2000 },
  POLISH_TEXT: { input: 60000, output: 16000 },
  BEAT_VERIFICATION: { input: 100000, output: 10000 },
  STORY_BIBLE_EXTRACT: { input: 800000, output: 16000 },
} as const;

export type TokenLimitKey = keyof typeof TOKEN_LIMITS;
