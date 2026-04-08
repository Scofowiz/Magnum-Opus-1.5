import type { Express, Request, Response } from "express";
import type {
  Character,
  ContextWindow,
  ContinuityIndex,
  LifetimeMemory,
  Location,
  NarrativeState,
  Project,
  ScenePromptPlanRecord,
  UserPreferences,
} from "../domain/types.js";
import {
  getLengthShortfall,
  hasContinuitySystemErrors,
  isBetterGenerationCandidate,
} from "../services/generation/candidateSelection.js";
import {
  buildQualityRetryInstruction,
  collectGenerationQualityIssues,
} from "../services/generation/qualityGuards.js";
import {
  deriveLifetimeInsights,
  recordProjectPreference,
} from "../services/memory/fourLayerMemory.js";
import { resolveChapterOutlineForChapter } from "../services/projects/chapterOutline.js";
import {
  applySONAEnhancement,
  learnFromFeedback,
  recordSONAOutcome,
} from "../../sona-learning.js";

export interface GenerationContinuityIssue {
  type: string;
  description: string;
  severity: string;
  fixable: "text" | "bible" | "author";
}

interface GenerationProjectShape {
  title: string;
  storyBible: {
    characters: Array<{ name: string }>;
    world?: {
      locations?: Array<{ name: string }>;
    };
  } | null;
}

export interface ApprovedGenerationDeps<
  TProject extends GenerationProjectShape,
> {
  chatCompletion(
    systemPrompt: string,
    userMessage: string,
    options?: {
      temperature?: number;
      maxTokens?: number;
      topP?: number;
      frequencyPenalty?: number;
      presencePenalty?: number;
      signal?: AbortSignal;
      model?: string;
    },
  ): Promise<{ text: string; tokens: number }>;
  checkContinuity(
    newText: string,
    project: TProject,
    options?: {
      chapterId?: string;
      povCharacterName?: string;
      recentContent?: string;
    },
  ): Promise<{ issues: GenerationContinuityIssue[]; score: number }>;
  scoreQuality(
    text: string,
    context: string,
  ): Promise<{
    score: number;
    breakdown: Record<string, number>;
    feedback: string;
    violations?: string[];
  }>;
  tokenLimits: {
    MAIN_GENERATION: { input: number; output: number };
    RETRY_GENERATION: { input: number; output: number };
  };
}

export interface ApprovedGenerationOptions<
  TProject extends GenerationProjectShape,
> {
  chapterId?: string;
  checkQuality: boolean;
  contextBefore: string;
  enableContinuityChecks: boolean;
  frequencyPenalty: number;
  logger: {
    info(message: string, data?: unknown): void;
    warn(message: string, data?: unknown): void;
    error(message: string, data?: unknown): void;
  };
  maxRetries: number;
  mode: "manual" | "autonomous";
  narrativeState?: {
    povCharacter?: string;
  };
  presencePenalty: number;
  project: TProject;
  qualityThreshold: number;
  signal?: AbortSignal;
  systemPrompt: string;
  targetWords: number;
  temperature: number;
  topP: number;
  userMessage: string;
  chapterCompletion?: {
    chapterTitle?: string;
    chapterSummary?: string;
    chapterBeats?: string[];
    remainingBeats?: string[];
    chapterTargetWords?: number;
    chapterGeneratedWords?: number;
  };
}

interface ApprovedGenerationCandidate {
  text: string;
  score: number;
  tokens: number;
  wordCount: number;
  lengthDelta: number;
  lengthOk: boolean;
  blocked: boolean;
  qualityIssues: string[];
}

export interface ApprovedGenerationResult {
  accepted: boolean;
  attempts: number;
  continuityIssues: GenerationContinuityIssue[];
  continuityScore: number;
  endOfChapter: boolean;
  endOfChapterReason?: string;
  maxTargetWords: number;
  minTargetWords: number;
  qualityIssues: string[];
  qualityScore: number;
  text: string;
  tokens: number;
  wordCount: number;
}

interface GenerationRouteDeps {
  buildGenerationContext(
    project: Project,
    contextWindow: ContextWindow,
    userPrompt: string,
    options?: {
      chapterId?: string;
      scenePlan?: ScenePromptPlanRecord | null;
      narrativeState?: NarrativeState;
      continuityIndex?: ContinuityIndex;
      mode?: "manual" | "autonomous";
    },
  ): {
    systemPrompt: string;
    userMessage: string;
    debug: Record<string, unknown>;
  };
  buildScenePromptPlan(
    project: Project,
    chapterId: string | undefined,
    sceneGoal: string,
    contextBefore: string,
    contextAfter: string,
  ): Promise<ScenePromptPlanRecord | null>;
  chatCompletion(
    systemPrompt: string,
    userMessage: string,
    options?: {
      temperature?: number;
      maxTokens?: number;
      topP?: number;
      frequencyPenalty?: number;
      presencePenalty?: number;
      signal?: AbortSignal;
      model?: string;
    },
  ): Promise<{ text: string; tokens: number }>;
  checkContinuity(
    newText: string,
    project: Project,
    options?: {
      chapterId?: string;
      povCharacterName?: string;
      recentContent?: string;
    },
  ): Promise<{ issues: GenerationContinuityIssue[]; score: number }>;
  config: {
    MAX_ONE_SHOT_TARGET_WORDS: number;
  };
  db: {
    getGeneratedDraft(id: string):
      | {
          id: string;
          projectId: string;
          chapterId: string;
          text: string;
          wordCount: number;
          status: "pending" | "persisted" | "dismissed";
          source: string;
          createdAt: string;
          updatedAt: string;
        }
      | undefined;
    getLatestPendingGeneratedDraft(
      projectId: string,
      chapterId: string,
    ):
      | {
          id: string;
          projectId: string;
          chapterId: string;
          text: string;
          wordCount: number;
          status: "pending" | "persisted" | "dismissed";
          source: string;
          createdAt: string;
          updatedAt: string;
        }
      | undefined;
    resolveGeneratedDraft(id: string, status: "persisted" | "dismissed"): void;
    saveGeneratedDraft(input: {
      projectId: string;
      chapterId: string;
      text: string;
      wordCount: number;
      source: string;
      prompt?: string;
      metadata?: Record<string, unknown>;
    }): string;
  };
  createLogger(scope: string): {
    info(message: string, data?: unknown): void;
    warn(message: string, data?: unknown): void;
    error(message: string, data?: unknown): void;
  };
  extractNarrativeState(contextBefore: string): Promise<NarrativeState>;
  getProviderConfig(): { type: string; model: string };
  getPromptPlanHistory(
    projectId: string | undefined,
    chapterId: string | undefined,
    limit: number,
  ): ScenePromptPlanRecord[];
  getUserPreferences(): UserPreferences;
  lifetimeMemory: LifetimeMemory;
  logger: {
    error(message: string, data?: unknown): void;
  };
  persistLifetimeMemory(): void;
  projects: Map<string, Project>;
  scoreQuality(
    text: string,
    context: string,
  ): Promise<{
    score: number;
    breakdown: Record<string, number>;
    feedback: string;
    violations?: string[];
  }>;
  tokenLimits: {
    MAIN_GENERATION: { input: number; output: number };
    RETRY_GENERATION: { input: number; output: number };
  };
  trackLatency(endpoint: string, latencyMs: number): void;
  trackQualityScore(endpoint: string, score: number): void;
  trackRequest(endpoint: string): void;
  trackTokens(endpoint: string, tokens: number): void;
  updateContinuityIndex(project: Project): ContinuityIndex;
}

function isGenericContinuationPrompt(prompt: string): boolean {
  const normalized = prompt.trim().toLowerCase();
  if (!normalized) return true;
  return [
    "continue",
    "continue naturally",
    "continue the story",
    "continue the story naturally",
    "write dialogue",
    "describe the scene",
    "add tension and conflict",
    "write internal monologue",
    "transition to next scene",
  ].includes(normalized);
}

function countGeneratedWords(value: string): number {
  return value.split(/\s+/).filter(Boolean).length;
}

function buildPrimaryGenerationPrompt(
  mode: ApprovedGenerationOptions<GenerationProjectShape>["mode"],
  userMessage: string,
  retryDirective: string,
  minTargetWords: number,
  maxTargetWords: number,
  targetWords: number,
): string {
  if (mode === "autonomous") {
    return `${userMessage}${retryDirective}\n\nLength requirement (strict): write at least ${minTargetWords} words. Going over is allowed. Do not stop early.\n\nAUTONOMOUS CONTINUATION RULES:\n- Continue directly from the existing scene.\n- Stay inside the active chapter.\n- Stop at a clean handoff point for the next iteration.\n- Do not add chapter headings or outline labels.\n- PACING: This is one autonomous pass inside a longer chapter. Advance the current beat naturally, but do not rush through all remaining chapter beats in this generation.`;
  }

  return `${userMessage}${retryDirective}\n\nLength target: aim for ${targetWords} words. Acceptable range ${minTargetWords}-${maxTargetWords}. If the passage has to err, let it land slightly long rather than short. Do not stop early.\n\nPACING: This is a ${targetWords}-word chapter. Pace the beats across the full length - do not rush through all beats in this generation.`;
}

function buildLengthRescuePrompt(
  mode: ApprovedGenerationOptions<GenerationProjectShape>["mode"],
  userMessage: string,
  existingText: string,
  wordsMissing: number,
): string {
  const base = `${userMessage}

=== GENERATED DRAFT SO FAR (do NOT repeat it) ===
${existingText}

CRITICAL LENGTH RESCUE INSTRUCTION:
- Continue immediately from the final sentence above.
- Do NOT restart, summarize, or reframe prior beats.
- Add approximately ${Math.max(120, wordsMissing)} to ${Math.max(220, Math.ceil(wordsMissing * 1.4))} new words.
- Keep continuity, tone, POV, and tense unchanged.
- Output ONLY the continuation text.`;

  if (mode === "autonomous") {
    return `${base}
- Stay inside the active chapter and current scene.
- Stop at a clean handoff point for the next iteration.
- Do not add chapter headings or outline labels.
- PACING: Advance the current beat naturally. Do not rush through all remaining chapter beats.`;
  }

  return `${base}
- PACING: Continue the current beat naturally. Do not rush through remaining chapter beats.`;
}

function buildChunkContinuationPrompt(
  mode: ApprovedGenerationOptions<GenerationProjectShape>["mode"],
  userMessage: string,
  assembledText: string,
  requestedChunkWords: number,
  targetWords: number,
): string {
  const base = `${userMessage}

=== APPROVED TEXT SO FAR (DO NOT REPEAT) ===
${assembledText || "(none yet)"}

CHUNK CONTINUATION TASK:
- Continue directly from the current trailing edge.
- Write approximately ${requestedChunkWords}-${Math.ceil(requestedChunkWords * 1.35)} new words.
- Do NOT restart the scene, summarize, or restate prior beats.
- Preserve POV, tense, continuity, and voice.
- Output ONLY the next chunk.`;

  if (mode === "autonomous") {
    return `${base}
- Stay inside the active chapter and current scene.
- Stop at a clean handoff point for the next iteration.
- Do not add chapter headings or outline labels.
- PACING: This is one autonomous pass inside a longer chapter. Advance the current beat naturally and do not rush through all remaining chapter beats in this chunk.`;
  }

  return `${base}
- Aim to bring the chapter closer to its full requested length. If the chunk has to err, let it err slightly long rather than short.
- PACING: This is one chunk of a ${targetWords}-word chapter. Do not rush through all chapter beats in this chunk. Let the scene unfold at natural pace.`;
}

async function assessChapterEnding<TProject extends GenerationProjectShape>(
  deps: ApprovedGenerationDeps<TProject>,
  options: ApprovedGenerationOptions<TProject>,
  text: string,
): Promise<{ endOfChapter: boolean; reason?: string }> {
  if (!text.trim() || !options.chapterId || !options.chapterCompletion) {
    return { endOfChapter: false };
  }

  const recentContext = options.contextBefore.slice(-6000).trim();
  const chapterTitle = options.chapterCompletion.chapterTitle || "(untitled)";
  const chapterSummary =
    options.chapterCompletion.chapterSummary || "(no chapter summary)";
  const chapterBeats =
    options.chapterCompletion.chapterBeats?.filter(Boolean) || [];
  const remainingBeats =
    options.chapterCompletion.remainingBeats?.filter(Boolean) || [];
  const chapterTargetWords = options.chapterCompletion.chapterTargetWords;
  const chapterGeneratedWords = options.chapterCompletion.chapterGeneratedWords;
  const projectedChapterWords =
    typeof chapterGeneratedWords === "number"
      ? chapterGeneratedWords + countGeneratedWords(text)
      : undefined;

  try {
    const { text: assessmentText } = await deps.chatCompletion(
      "You are a strict fiction editor deciding whether the latest approved prose genuinely lands as the END OF A CHAPTER. Return only valid JSON.",
      `CHAPTER TITLE:
${chapterTitle}

CHAPTER SUMMARY:
${chapterSummary}

CHAPTER BEATS:
${chapterBeats.length > 0 ? chapterBeats.map((beat, index) => `${index + 1}. ${beat}`).join("\n") : "(none listed)"}

BEATS NOT YET VERIFIED BEFORE THIS PASS:
${remainingBeats.length > 0 ? remainingBeats.map((beat, index) => `${index + 1}. ${beat}`).join("\n") : "(none listed)"}

AUTONOMOUS CHAPTER TARGET:
${typeof chapterTargetWords === "number" ? chapterTargetWords : "(not provided)"}

WORDS WRITTEN IN THIS CHAPTER SESSION BEFORE THIS PASS:
${typeof chapterGeneratedWords === "number" ? chapterGeneratedWords : "(not provided)"}

PROJECTED WORDS IN THIS CHAPTER SESSION AFTER THIS PASS:
${typeof projectedChapterWords === "number" ? projectedChapterWords : "(not provided)"}

RECENT CHAPTER CONTEXT:
${recentContext || "(none)"}

LATEST APPROVED PASSAGE:
${text}

Return only JSON in this shape:
{"endOfChapter":true,"reason":"brief reason"}

Mark endOfChapter true only when the latest approved passage clearly lands with chapter-ending cadence, closure, transition, or handoff to the next chapter.
Mark false when it reads like the scene should continue in the same chapter, or when unresolved required beats still obviously belong in this chapter.
If the projected chapter words are materially under target and unresolved required beats remain, mark false.
Only mark true under target when the chapter genuinely feels complete and the remaining beats no longer belong in this chapter.
Keep the reason under 20 words.`,
      {
        temperature: 0,
        topP: 0.2,
        maxTokens: 120,
        signal: options.signal,
      },
    );

    const parsed = JSON.parse(assessmentText) as {
      endOfChapter?: unknown;
      reason?: unknown;
    };
    return {
      endOfChapter: parsed.endOfChapter === true,
      reason:
        typeof parsed.reason === "string" ? parsed.reason.trim() : undefined,
    };
  } catch (error) {
    options.logger.warn("Chapter-end assessment failed; defaulting to false", {
      error: String(error),
      chapterId: options.chapterId,
      mode: options.mode,
    });
    return { endOfChapter: false };
  }
}

export async function runApprovedGeneration<
  TProject extends GenerationProjectShape,
>(
  deps: ApprovedGenerationDeps<TProject>,
  options: ApprovedGenerationOptions<TProject>,
): Promise<ApprovedGenerationResult> {
  const {
    chapterId,
    chapterCompletion,
    checkQuality,
    contextBefore,
    enableContinuityChecks,
    frequencyPenalty,
    logger,
    maxRetries,
    mode,
    narrativeState,
    presencePenalty,
    project,
    qualityThreshold,
    signal,
    systemPrompt,
    targetWords,
    temperature,
    topP,
    userMessage,
  } = options;

  const minTargetWords =
    mode === "manual"
      ? Math.max(50, Math.floor(targetWords * 0.9))
      : Math.max(50, Math.ceil(targetWords));
  const maxTargetWords =
    mode === "manual"
      ? Math.max(minTargetWords, Math.ceil(targetWords * 1.15))
      : minTargetWords;
  const desiredTargetWords = mode === "manual" ? targetWords : minTargetWords;
  const chunkFirstMode = checkQuality && targetWords >= 1200;

  let bestResult: ApprovedGenerationCandidate = {
    text: "",
    score: 0,
    tokens: 0,
    wordCount: 0,
    lengthDelta: Number.POSITIVE_INFINITY,
    lengthOk: false,
    blocked: true,
    qualityIssues: [],
  };
  let attempts = 0;
  let accepted = false;
  let retryQualityIssues: string[] = [];

  if (!chunkFirstMode) {
    while (attempts < maxRetries) {
      attempts += 1;
      const retryDirective =
        retryQualityIssues.length > 0
          ? `\n\n${buildQualityRetryInstruction(retryQualityIssues)}`
          : "";
      const requestTemperature =
        retryQualityIssues.length > 0
          ? Math.max(0.35, temperature - (attempts - 1) * 0.1)
          : temperature + (attempts - 1) * 0.05;

      logger.info("Calling approved generation pass", {
        mode,
        attempt: `${attempts}/${maxRetries}`,
        temperature: requestTemperature,
        topP,
        frequencyPenalty,
        presencePenalty,
        maxTokens: deps.tokenLimits.MAIN_GENERATION.output,
      });

      const { text: generatedText, tokens } = await deps.chatCompletion(
        systemPrompt,
        buildPrimaryGenerationPrompt(
          mode,
          userMessage,
          retryDirective,
          minTargetWords,
          maxTargetWords,
          targetWords,
        ),
        {
          temperature: requestTemperature,
          topP,
          frequencyPenalty,
          presencePenalty,
          maxTokens: deps.tokenLimits.MAIN_GENERATION.output,
          signal,
        },
      );

      const wordCount = countGeneratedWords(generatedText);
      const lengthDelta = getLengthShortfall(targetWords, wordCount);
      const lengthOk =
        wordCount >= minTargetWords && wordCount <= maxTargetWords;

      logger.info("Approved generation candidate received", {
        mode,
        tokens,
        wordCount,
        lengthOk,
        targetWords,
        minTargetWords,
        maxTargetWords,
      });

      if (!checkQuality) {
        const deterministicIssues = collectGenerationQualityIssues(
          generatedText,
          contextBefore,
        );
        const blocked = deterministicIssues.length > 0;
        const candidate = {
          text: generatedText,
          score: blocked ? 0 : 0.8,
          tokens,
          wordCount,
          lengthDelta,
          lengthOk,
          blocked,
          qualityIssues: deterministicIssues,
        };
        if (isBetterGenerationCandidate(candidate, bestResult)) {
          bestResult = candidate;
        }
        if (lengthOk && !blocked) {
          logger.info(
            "Approved generation accepted candidate with quality checks disabled",
            { mode },
          );
          accepted = true;
          break;
        }
        retryQualityIssues = deterministicIssues;
        logger.warn(
          blocked
            ? "Approved generation blocked candidate by deterministic guard"
            : "Approved generation candidate failed length gate with quality checks disabled",
          {
            mode,
            issues: deterministicIssues,
          },
        );
        continue;
      }

      const deterministicIssues = collectGenerationQualityIssues(
        generatedText,
        contextBefore,
      );
      if (deterministicIssues.length > 0) {
        logger.warn(
          "Approved generation blocked candidate by deterministic guard",
          {
            mode,
            issues: deterministicIssues,
          },
        );
        retryQualityIssues = deterministicIssues;
        const candidate = {
          text: generatedText,
          score: 0,
          tokens,
          wordCount,
          lengthDelta,
          lengthOk,
          blocked: true,
          qualityIssues: deterministicIssues,
        };
        if (isBetterGenerationCandidate(candidate, bestResult)) {
          bestResult = candidate;
        }
        continue;
      }

      const quality = await deps.scoreQuality(generatedText, contextBefore);
      logger.info("Approved generation quality score computed", {
        mode,
        score: quality.score,
        threshold: qualityThreshold,
        accepted: quality.score >= qualityThreshold && lengthOk,
      });

      const candidate = {
        text: generatedText,
        score: quality.score,
        tokens,
        wordCount,
        lengthDelta,
        lengthOk,
        blocked: false,
        qualityIssues: quality.violations || [],
      };
      if (isBetterGenerationCandidate(candidate, bestResult)) {
        bestResult = candidate;
      }

      if (quality.score >= qualityThreshold && lengthOk) {
        accepted = true;
        break;
      }

      if (quality.score < qualityThreshold) {
        retryQualityIssues = quality.violations?.length
          ? quality.violations
          : quality.feedback
            ? [quality.feedback]
            : [];
        logger.warn("Approved generation candidate failed quality threshold", {
          mode,
          score: quality.score,
          threshold: qualityThreshold,
        });
      } else {
        logger.warn("Approved generation candidate failed length gate", {
          mode,
          wordCount,
          minTargetWords,
          maxTargetWords,
        });
      }
    }
  } else {
    logger.info("Approved generation chunk-first mode enabled", {
      mode,
      targetWords,
      minTargetWords,
      maxTargetWords,
      chunkTargetWords: 500,
    });
  }

  if (
    !accepted &&
    !bestResult.blocked &&
    bestResult.score >= qualityThreshold &&
    bestResult.wordCount < minTargetWords
  ) {
    const wordsMissing = Math.max(
      minTargetWords - bestResult.wordCount,
      desiredTargetWords - bestResult.wordCount,
    );
    const maxContinuationTokens = Math.min(
      deps.tokenLimits.RETRY_GENERATION.output,
      Math.max(600, Math.ceil(wordsMissing * 2.4)),
    );
    logger.warn("Approved generation applying length rescue pass", {
      mode,
      score: bestResult.score,
      threshold: qualityThreshold,
      wordCount: bestResult.wordCount,
      minTargetWords,
      wordsMissing,
      maxContinuationTokens,
    });

    const continuationTemperature = Math.max(0.5, temperature - 0.05);
    const { text: continuationText, tokens: continuationTokens } =
      await deps.chatCompletion(
        systemPrompt,
        buildLengthRescuePrompt(
          mode,
          userMessage,
          bestResult.text,
          wordsMissing,
        ),
        {
          temperature: continuationTemperature,
          topP,
          frequencyPenalty,
          presencePenalty,
          maxTokens: maxContinuationTokens,
          signal,
        },
      );

    const continuation = continuationText.trim();
    if (continuation.length > 0) {
      const mergedText = `${bestResult.text.trimEnd()}\n\n${continuation}`;
      const mergedWordCount = countGeneratedWords(mergedText);
      const mergedLengthDelta = getLengthShortfall(
        targetWords,
        mergedWordCount,
      );
      const mergedLengthOk =
        mergedWordCount >= minTargetWords && mergedWordCount <= maxTargetWords;
      const continuationIssues = collectGenerationQualityIssues(
        continuation,
        bestResult.text.slice(-8000),
      );

      const candidate = {
        text: mergedText,
        score: Math.max(
          0.3,
          bestResult.score - continuationIssues.length * 0.04,
        ),
        tokens: bestResult.tokens + continuationTokens,
        wordCount: mergedWordCount,
        lengthDelta: mergedLengthDelta,
        lengthOk: mergedLengthOk,
        blocked: false,
        qualityIssues: [
          ...bestResult.qualityIssues,
          ...continuationIssues,
        ].slice(0, 8),
      };

      if (isBetterGenerationCandidate(candidate, bestResult)) {
        bestResult = candidate;
      }
      if (bestResult.lengthOk) {
        accepted = true;
      }
    }
  }

  if (!accepted && checkQuality && targetWords >= 1200) {
    const chunkTargetWords = 500;
    const seedIsUsable =
      bestResult.text.trim().length > 0 &&
      !bestResult.blocked &&
      bestResult.score >= qualityThreshold;
    let assembledText = seedIsUsable ? bestResult.text.trim() : "";
    let assembledWords = countGeneratedWords(assembledText);
    let assembledTokens = seedIsUsable ? bestResult.tokens : 0;
    let chunkPasses = 0;
    let chunkScoreTotal = 0;
    let chunkAttemptsUsed = 0;
    const estimatedChunks = Math.max(
      1,
      Math.ceil(
        Math.max(0, desiredTargetWords - assembledWords) / chunkTargetWords,
      ),
    );
    const maxChunkAttempts = Math.min(
      14,
      Math.max(estimatedChunks * 2 + 1, estimatedChunks + 4),
    );

    if (assembledWords < desiredTargetWords) {
      logger.warn(
        "Approved generation attempting chunked continuation recovery",
        {
          mode,
          seedIsUsable,
          seedWords: assembledWords,
          desiredTargetWords,
          minTargetWords,
          chunkTargetWords,
          maxChunkAttempts,
        },
      );
    }

    while (
      assembledWords < desiredTargetWords &&
      chunkAttemptsUsed < maxChunkAttempts
    ) {
      chunkAttemptsUsed += 1;
      const remaining = desiredTargetWords - assembledWords;
      const requestedChunkWords = Math.min(
        chunkTargetWords,
        Math.max(260, remaining),
      );
      const maxChunkTokens = Math.min(
        deps.tokenLimits.RETRY_GENERATION.output,
        Math.max(1000, Math.ceil(requestedChunkWords * 2.8)),
      );
      const chunkTemp = Math.max(0.5, temperature - 0.05);

      const { text: chunkTextRaw, tokens: chunkTokens } =
        await deps.chatCompletion(
          systemPrompt,
          buildChunkContinuationPrompt(
            mode,
            userMessage,
            assembledText,
            requestedChunkWords,
            targetWords,
          ),
          {
            temperature: chunkTemp,
            topP,
            frequencyPenalty,
            presencePenalty,
            maxTokens: maxChunkTokens,
            signal,
          },
        );

      const chunkText = chunkTextRaw.trim();
      if (!chunkText) {
        logger.warn(
          "Approved generation received empty chunk during recovery",
          {
            mode,
            attempt: chunkAttemptsUsed,
          },
        );
        continue;
      }

      const chunkIssues = collectGenerationQualityIssues(
        chunkText,
        assembledText.slice(-8000),
      );
      if (chunkIssues.length > 0) {
        logger.warn(
          "Approved generation rejected recovery chunk by deterministic guard",
          {
            mode,
            issues: chunkIssues,
            attempt: chunkAttemptsUsed,
          },
        );
        continue;
      }

      const chunkScore = await deps.scoreQuality(
        chunkText,
        assembledText.slice(-8000),
      );
      const chunkWords = countGeneratedWords(chunkText);
      const chunkLengthFloorRatio = mode === "manual" ? 0.9 : 0.8;
      const chunkLengthOk =
        chunkWords >=
        Math.max(220, Math.floor(requestedChunkWords * chunkLengthFloorRatio));
      const chunkQualityThreshold = Math.max(qualityThreshold, 0.7);
      const chunkQualityOk = chunkScore.score >= chunkQualityThreshold;

      if (!chunkLengthOk || !chunkQualityOk) {
        logger.warn(
          "Approved generation rejected recovery chunk by quality/length",
          {
            mode,
            attempt: chunkAttemptsUsed,
            chunkWords,
            requestedChunkWords,
            chunkLengthOk,
            chunkScore: chunkScore.score,
            chunkQualityThreshold,
          },
        );
        continue;
      }

      assembledText = assembledText
        ? `${assembledText}\n\n${chunkText}`
        : chunkText;
      assembledWords = countGeneratedWords(assembledText);
      assembledTokens += chunkTokens;
      chunkPasses += 1;
      chunkScoreTotal += chunkScore.score;

      logger.info("Approved generation accepted recovery chunk", {
        mode,
        attempt: chunkAttemptsUsed,
        chunkWords,
        assembledWords,
        desiredTargetWords,
      });
    }

    if (assembledWords >= minTargetWords) {
      const assembledIssues = collectGenerationQualityIssues(
        assembledText,
        contextBefore,
      );
      const finalBlocked = assembledIssues.length > 0;
      const finalQuality = finalBlocked
        ? { score: 0, violations: assembledIssues }
        : await deps.scoreQuality(assembledText, contextBefore);
      const mergedLengthDelta = getLengthShortfall(targetWords, assembledWords);
      const mergedLengthOk =
        assembledWords >= minTargetWords && assembledWords <= maxTargetWords;
      const avgChunkScore = chunkPasses > 0 ? chunkScoreTotal / chunkPasses : 0;
      const mergedScore = finalBlocked
        ? 0
        : Math.max(bestResult.score, avgChunkScore, finalQuality.score);
      const candidate = {
        text: assembledText,
        score: mergedScore,
        tokens: Math.max(bestResult.tokens, assembledTokens),
        wordCount: assembledWords,
        lengthDelta: mergedLengthDelta,
        lengthOk: mergedLengthOk,
        blocked: finalBlocked,
        qualityIssues: finalQuality.violations || [],
      };

      if (isBetterGenerationCandidate(candidate, bestResult)) {
        bestResult = candidate;
      }

      if (
        bestResult.lengthOk &&
        !bestResult.blocked &&
        bestResult.score >= qualityThreshold
      ) {
        accepted = true;
        logger.info("Approved generation chunked recovery satisfied gates", {
          mode,
          finalWords: bestResult.wordCount,
          finalScore: bestResult.score,
        });
      } else {
        logger.warn(
          "Approved generation assembled recovery failed final gate",
          {
            mode,
            finalWords: bestResult.wordCount,
            finalScore: bestResult.score,
            blocked: bestResult.blocked,
            issues: bestResult.qualityIssues,
          },
        );
      }
    } else {
      logger.warn(
        "Approved generation exhausted chunked recovery attempts before minimum length",
        {
          mode,
          assembledWords,
          minTargetWords,
          chunkAttemptsUsed,
        },
      );
    }
  }

  let continuityResult: {
    issues: GenerationContinuityIssue[];
    score: number;
  } = { issues: [], score: 1.0 };

  if (project.storyBible && enableContinuityChecks && bestResult.text.trim()) {
    logger.info("Approved generation checking continuity", { mode });
    continuityResult = await deps.checkContinuity(bestResult.text, project, {
      chapterId,
      povCharacterName: narrativeState?.povCharacter,
      recentContent: contextBefore,
    });
    logger.info("Approved generation continuity score computed", {
      mode,
      score: continuityResult.score,
      issues: continuityResult.issues.length,
    });

    const textFixable = continuityResult.issues.filter(
      (issue) => issue.fixable === "text",
    );
    const systemErrorsPresent = hasContinuitySystemErrors(
      continuityResult.issues,
    );
    if (systemErrorsPresent) {
      logger.warn(
        "Approved generation continuity checks had system errors; skipping fix passes",
        { mode },
      );
    }

    let fixPass = 0;
    const preFix = { text: bestResult.text, score: continuityResult.score };
    while (!systemErrorsPresent && textFixable.length > 0 && fixPass < 3) {
      fixPass += 1;
      logger.warn("Approved generation continuity fix pass starting", {
        mode,
        fixPass,
        issues: textFixable.length,
      });

      const issueList = textFixable
        .map(
          (issue) =>
            `- [${issue.severity}] ${issue.type}: ${issue.description}`,
        )
        .join("\n");

      const characterNames = project.storyBible.characters
        .map((character) => character.name)
        .join(", ");
      const locationNames = (project.storyBible.world?.locations || [])
        .map((location) => location.name)
        .join(", ");

      const { text: fixedText, tokens: fixTokens } = await deps.chatCompletion(
        `You are a surgical fiction editor. Fix ONLY the listed continuity issues. Preserve everything else exactly.

SCOPE OF THIS PASS:
- Work only with characters already in the text or this list: ${characterNames}
- Work only with locations already in the text or this list: ${locationNames}
- Use whatever name form the text already uses — do not formalize to full bible names
- Keep all props, objects, and scene details as they exist on the page
- Hold the existing plot threads, beats, and thematic elements intact
- Change only the dialogue or action that a listed violation directly requires
- Match or come in under the original length — this is a repair, not a rewrite`,
        `ORIGINAL TEXT:
${bestResult.text}

ISSUES TO FIX (fix ONLY these, change nothing else):
${issueList}

Output ONLY the corrected text.`,
        {
          temperature: 0.8,
          topP: 0.7,
          maxTokens: deps.tokenLimits.RETRY_GENERATION.output,
          signal,
        },
      );

      bestResult.tokens += fixTokens;

      const recheck = await deps.checkContinuity(fixedText, project, {
        chapterId,
        povCharacterName: narrativeState?.povCharacter,
        recentContent: contextBefore,
      });
      const recheckTextFixable = recheck.issues.filter(
        (issue) => issue.fixable === "text",
      );

      if (recheck.score < continuityResult.score) {
        logger.warn(
          "Approved generation continuity fix made score worse; reverting to pre-fix text",
          {
            mode,
            before: continuityResult.score,
            after: recheck.score,
          },
        );
        bestResult.text = preFix.text;
        continuityResult = await deps.checkContinuity(preFix.text, project, {
          chapterId,
          povCharacterName: narrativeState?.povCharacter,
          recentContent: contextBefore,
        });
        break;
      }

      bestResult.text = fixedText;
      continuityResult = recheck;
      logger.info("Approved generation continuity fix pass completed", {
        mode,
        fixPass,
        score: recheck.score,
        remainingIssues: recheckTextFixable.length,
      });

      textFixable.length = 0;
      textFixable.push(...recheckTextFixable);
    }
  }

  if (project.storyBible && !enableContinuityChecks) {
    logger.info(
      "Approved generation continuity checks disabled by preferences; skipping pass",
      { mode },
    );
  }

  const chapterEnding = await assessChapterEnding(
    deps,
    options,
    bestResult.text,
  );
  if (chapterEnding.endOfChapter) {
    logger.info("Approved generation flagged chapter ending", {
      mode,
      chapterId,
      reason: chapterEnding.reason,
      chapterTitle: chapterCompletion?.chapterTitle,
    });
  }

  return {
    accepted,
    attempts,
    continuityIssues: continuityResult.issues,
    continuityScore: continuityResult.score,
    endOfChapter: chapterEnding.endOfChapter,
    endOfChapterReason: chapterEnding.reason,
    maxTargetWords,
    minTargetWords,
    qualityIssues: bestResult.qualityIssues,
    qualityScore: bestResult.score,
    text: bestResult.text,
    tokens: bestResult.tokens,
    wordCount: countGeneratedWords(bestResult.text),
  };
}

export function registerGenerationRoutes(
  app: Express,
  deps: GenerationRouteDeps,
): void {
  const persistRecoverableDraft = (input: {
    projectId?: string;
    chapterId?: string;
    text: string;
    wordCount: number;
    source: string;
    prompt?: string;
    metadata?: Record<string, unknown>;
  }): string | undefined => {
    if (
      !input.projectId ||
      !input.chapterId ||
      typeof input.projectId !== "string" ||
      typeof input.chapterId !== "string" ||
      !input.text.trim()
    ) {
      return undefined;
    }

    try {
      return deps.db.saveGeneratedDraft({
        projectId: input.projectId,
        chapterId: input.chapterId,
        text: input.text,
        wordCount: input.wordCount,
        source: input.source,
        prompt: input.prompt,
        metadata: input.metadata,
      });
    } catch (error) {
      deps.logger.error("Failed to persist recoverable generation draft", {
        error: String(error),
        projectId: input.projectId,
        chapterId: input.chapterId,
        source: input.source,
      });
      return undefined;
    }
  };

  app.get(
    "/api/generate/recovery/latest",
    (req: Request, res: Response): Response | void => {
      deps.trackRequest("/api/generate/recovery/latest");
      const { projectId, chapterId } = req.query;

      if (typeof projectId !== "string" || typeof chapterId !== "string") {
        return res
          .status(400)
          .json({ error: "projectId and chapterId are required" });
      }

      const draft = deps.db.getLatestPendingGeneratedDraft(
        projectId,
        chapterId,
      );
      res.json(draft || null);
    },
  );

  app.get("/api/generate/recovery/:draftId", (req: Request, res: Response) => {
    deps.trackRequest("/api/generate/recovery/:draftId");
    const draft = deps.db.getGeneratedDraft(req.params.draftId);
    res.json(draft || null);
  });

  app.post(
    "/api/generate/recovery/:draftId/resolve",
    (req: Request, res: Response): Response | void => {
      deps.trackRequest("/api/generate/recovery/:draftId/resolve");
      const { status } = req.body;

      if (status !== "persisted" && status !== "dismissed") {
        return res
          .status(400)
          .json({ error: 'status must be "persisted" or "dismissed"' });
      }

      deps.db.resolveGeneratedDraft(req.params.draftId, status);
      res.json({ resolved: true, status });
    },
  );

  app.post("/api/generate", async (req: Request, res: Response) => {
    const genLog = deps.createLogger("generate");
    deps.trackRequest("/api/generate");
    const startTime = Date.now();
    let sonaTrajectoryId: string | null = null;

    try {
      const userPreferences = deps.getUserPreferences();
      const providerConfig = deps.getProviderConfig();
      const qualityThreshold = Math.max(
        0.1,
        Math.min(1, userPreferences.qualitySettings.minThreshold / 10),
      );
      const {
        projectId,
        chapterId,
        contextBefore = "",
        contextAfter = "",
        prompt = "",
        targetWords = userPreferences.generationSettings.defaultTargetWords,
        temperature = userPreferences.generationSettings.defaultTemperature,
        topP = userPreferences.generationSettings.defaultTopP,
        frequencyPenalty = userPreferences.generationSettings
          .defaultFrequencyPenalty,
        presencePenalty = userPreferences.generationSettings
          .defaultPresencePenalty,
        checkQuality = true,
        maxRetries = 4,
        allowQualityFallback = false,
        usePromptPlanner = userPreferences.generationSettings
          .enablePromptPlanner,
      } = req.body;

      genLog.info("Generation request received", {
        projectId,
        chapterId,
        targetWords,
        temperature,
        topP,
        frequencyPenalty,
        presencePenalty,
        checkQuality,
        maxRetries,
        allowQualityFallback,
        usePromptPlanner,
        contextBeforeLen: contextBefore.length,
        contextAfterLen: contextAfter.length,
        prompt: prompt.slice(0, 100) || "(none)",
        provider: providerConfig.type,
        model: providerConfig.model,
      });

      if (projectId !== undefined && typeof projectId !== "string") {
        return res.status(400).json({ error: "projectId must be a string" });
      }
      if (chapterId !== undefined && typeof chapterId !== "string") {
        return res.status(400).json({ error: "chapterId must be a string" });
      }
      if (
        typeof contextBefore !== "string" ||
        typeof contextAfter !== "string"
      ) {
        return res
          .status(400)
          .json({ error: "contextBefore and contextAfter must be strings" });
      }
      if (typeof prompt !== "string") {
        return res.status(400).json({ error: "prompt must be a string" });
      }
      if (
        typeof targetWords !== "number" ||
        targetWords < 10 ||
        targetWords > deps.config.MAX_ONE_SHOT_TARGET_WORDS
      ) {
        return res.status(400).json({
          error: `targetWords must be between 10 and ${deps.config.MAX_ONE_SHOT_TARGET_WORDS}`,
        });
      }
      if (
        typeof temperature !== "number" ||
        temperature < 0 ||
        temperature > 2
      ) {
        return res
          .status(400)
          .json({ error: "temperature must be between 0 and 2" });
      }
      if (typeof topP !== "number" || topP <= 0 || topP > 1) {
        return res.status(400).json({ error: "topP must be between 0 and 1" });
      }
      if (
        typeof frequencyPenalty !== "number" ||
        frequencyPenalty < 0 ||
        frequencyPenalty > 2
      ) {
        return res
          .status(400)
          .json({ error: "frequencyPenalty must be between 0 and 2" });
      }
      if (
        typeof presencePenalty !== "number" ||
        presencePenalty < -2 ||
        presencePenalty > 2
      ) {
        return res
          .status(400)
          .json({ error: "presencePenalty must be between -2 and 2" });
      }
      if (typeof maxRetries !== "number" || maxRetries < 1 || maxRetries > 5) {
        return res
          .status(400)
          .json({ error: "maxRetries must be between 1 and 5" });
      }
      if (typeof allowQualityFallback !== "boolean") {
        return res
          .status(400)
          .json({ error: "allowQualityFallback must be a boolean" });
      }
      if (typeof usePromptPlanner !== "boolean") {
        return res
          .status(400)
          .json({ error: "usePromptPlanner must be a boolean" });
      }

      let project = projectId ? deps.projects.get(projectId) : undefined;
      if (!project) {
        project = {
          id: "temp",
          title: "Untitled",
          description: "",
          genre: "",
          content: contextBefore,
          wordCount: 0,
          chapters: [],
          storyBible: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      }

      genLog.info("Building context", {
        project: project.title,
        hasStoryBible: !!project.storyBible,
        chapterCount: project.chapters.length,
      });

      const contextWindow: ContextWindow = {
        before: contextBefore.slice(-deps.tokenLimits.MAIN_GENERATION.input),
        after: contextAfter.slice(0, deps.tokenLimits.MAIN_GENERATION.input),
        cursorPosition: contextBefore.length,
      };

      const hasStrongLocalContext =
        contextWindow.before.trim().length + contextWindow.after.trim().length >
        400;
      const shouldUsePromptPlanner =
        usePromptPlanner &&
        prompt.trim().length > 0 &&
        !!projectId &&
        !hasStrongLocalContext &&
        !isGenericContinuationPrompt(prompt);

      let scenePlan: ScenePromptPlanRecord | null = null;
      if (shouldUsePromptPlanner) {
        scenePlan = await deps.buildScenePromptPlan(
          project,
          chapterId,
          prompt,
          contextWindow.before,
          contextWindow.after,
        );
        if (scenePlan) {
          genLog.info("Scene planner attached to generation context", {
            planId: scenePlan.id,
            objectives: scenePlan.objectives.length,
            evidenceCount: scenePlan.selectedEvidence.length,
            plannerModelUsed: scenePlan.plannerModelUsed,
            embeddingModelUsed: scenePlan.embeddingModelUsed,
          });
        }
      } else if (usePromptPlanner && prompt.trim().length > 0 && projectId) {
        genLog.info("Scene planner skipped for interactive generation", {
          hasStrongLocalContext,
          genericPrompt: isGenericContinuationPrompt(prompt),
        });
      }

      const continuityIndex = project.storyBible
        ? deps.updateContinuityIndex(project)
        : undefined;
      const narrativeState =
        contextWindow.before.trim().length > 0
          ? await deps.extractNarrativeState(contextWindow.before)
          : undefined;
      const currentChapter = chapterId
        ? project.chapters.find((candidate) => candidate.id === chapterId)
        : undefined;
      const chapterOutline = resolveChapterOutlineForChapter(
        currentChapter,
        project.storyBible?.chapterOutlines,
      );

      const { systemPrompt, userMessage, debug } = deps.buildGenerationContext(
        project,
        contextWindow,
        prompt,
        {
          chapterId,
          scenePlan,
          narrativeState,
          continuityIndex,
          mode: "manual",
        },
      );
      const sonaTask = prompt.trim()
        ? `creative generation: ${prompt.slice(0, 180)}`
        : `creative generation for ${project.title}`;
      const sonaEnhancement = applySONAEnhancement(systemPrompt, sonaTask);
      sonaTrajectoryId = sonaEnhancement.trajectoryId;
      const activeSystemPrompt = sonaEnhancement.enhancedContext;
      genLog.info("Curated prompt context built", {
        ...debug,
        narrativeState,
        usedLocalNarrativeState: !!narrativeState,
        sonaEnhanced: true,
      });

      const generationResult = await runApprovedGeneration(
        {
          chatCompletion: deps.chatCompletion,
          checkContinuity: deps.checkContinuity,
          scoreQuality: deps.scoreQuality,
          tokenLimits: deps.tokenLimits,
        },
        {
          chapterId,
          checkQuality,
          contextBefore,
          enableContinuityChecks:
            userPreferences.memorySettings.enableContinuityChecks,
          frequencyPenalty,
          logger: genLog,
          maxRetries,
          mode: "manual",
          narrativeState,
          presencePenalty,
          project,
          qualityThreshold,
          systemPrompt: activeSystemPrompt,
          targetWords,
          temperature,
          topP,
          userMessage,
          chapterCompletion: {
            chapterTitle: currentChapter?.title,
            chapterSummary: chapterOutline?.summary,
            chapterBeats: chapterOutline?.beats,
          },
        },
      );

      const minTargetWords = generationResult.minTargetWords;
      const maxTargetWords = generationResult.maxTargetWords;
      const bestResult = {
        text: generationResult.text,
        score: generationResult.qualityScore,
        tokens: generationResult.tokens,
        wordCount: generationResult.wordCount,
        qualityIssues: generationResult.qualityIssues,
      };
      const attempts = generationResult.attempts;
      const accepted = generationResult.accepted;
      const usedQualityFallback = false;
      const fallbackReason = "";
      const recoveryDraftId = persistRecoverableDraft({
        projectId,
        chapterId,
        text: bestResult.text,
        wordCount: bestResult.wordCount,
        source: accepted
          ? "interactive_generation"
          : "interactive_generation_blocked",
        prompt,
        metadata: {
          accepted,
          attempts,
          provider: providerConfig.type,
          model: providerConfig.model,
          qualityScore: bestResult.score,
        },
      });

      if (checkQuality && !accepted) {
        const lengthRequirement =
          minTargetWords === maxTargetWords
            ? `at least ${minTargetWords}`
            : `${minTargetWords}-${maxTargetWords}`;
        return res.status(422).json({
          error: `Generation blocked: output must pass BOTH quality and length gates. Best score ${bestResult.score.toFixed(2)} (threshold ${qualityThreshold.toFixed(2)}), words ${bestResult.wordCount} (required ${lengthRequirement}).`,
          text: bestResult.text,
          accepted: false,
          qualityIssues: bestResult.qualityIssues,
          qualityScore: bestResult.score,
          wordCount: bestResult.wordCount,
          minTargetWords,
          maxTargetWords,
          attempts,
          recoveryDraftId,
        });
      }

      const continuityResult = {
        issues: generationResult.continuityIssues,
        score: generationResult.continuityScore,
      };
      const autoPopulated = {
        characters: [] as Character[],
        locations: [] as Location[],
      };
      const authorDecisions = continuityResult.issues.filter(
        (issue) => issue.fixable === "author",
      );
      const bibleFixable = continuityResult.issues.filter(
        (issue) => issue.fixable === "bible",
      );
      if (authorDecisions.length > 0) {
        genLog.info(
          `${authorDecisions.length} author-decision violations — surfacing to user`,
        );
      }
      if (bibleFixable.length > 0) {
        genLog.info(
          `${bibleFixable.length} bible-fixable violations — surfacing only; manual generation does not mutate Story Bible`,
        );
      }

      const latencyMs = Date.now() - startTime;
      deps.trackTokens("/api/generate", bestResult.tokens);
      deps.trackLatency("/api/generate", latencyMs);
      if (bestResult.score > 0) {
        deps.trackQualityScore("/api/generate", bestResult.score);
      }

      deps.lifetimeMemory.writingHistory.push({
        date: new Date().toISOString(),
        wordsWritten: bestResult.text.split(/\s+/).filter(Boolean).length,
        projectId: projectId || "standalone",
      });
      deps.lifetimeMemory.insights = deriveLifetimeInsights(
        deps.lifetimeMemory,
      );
      deps.persistLifetimeMemory();

      if (sonaTrajectoryId) {
        const sonaFeedback = [
          ...bestResult.qualityIssues.slice(0, 3),
          ...continuityResult.issues
            .slice(0, 2)
            .map((issue) => issue.description),
        ]
          .filter(Boolean)
          .join(" | ");
        const blendedQuality =
          bestResult.score > 0
            ? Math.max(
                0,
                Math.min(
                  1,
                  bestResult.score * 0.75 + continuityResult.score * 0.25,
                ),
              )
            : accepted
              ? 0.72
              : 0.28;
        const sonaResult = recordSONAOutcome(
          sonaTrajectoryId,
          bestResult.text,
          blendedQuality,
          sonaFeedback || undefined,
        );
        genLog.info("SONA outcome recorded", sonaResult);
      }

      genLog.info("Generation complete", {
        tokens: bestResult.tokens,
        latencyMs,
        qualityScore: bestResult.score,
        attempts,
        wordCount: bestResult.text.split(/\s+/).filter(Boolean).length,
        autoPopulatedCharacters: autoPopulated.characters.length,
        autoPopulatedLocations: autoPopulated.locations.length,
      });

      const finalProvider = deps.getProviderConfig();
      res.json({
        text: bestResult.text,
        wordCount: bestResult.text.split(/\s+/).filter(Boolean).length,
        qualityScore: bestResult.score,
        qualityIssues: bestResult.qualityIssues,
        accepted,
        recoveryDraftId,
        endOfChapter: generationResult.endOfChapter,
        endOfChapterReason: generationResult.endOfChapterReason,
        qualityFallback: usedQualityFallback,
        qualityFallbackReason: fallbackReason || undefined,
        continuityScore: continuityResult.score,
        continuityIssues: continuityResult.issues,
        autoPopulated:
          autoPopulated.characters.length > 0 ||
          autoPopulated.locations.length > 0
            ? {
                characters: autoPopulated.characters.map((character) => ({
                  name: character.name,
                  role: character.role,
                  description: character.description,
                })),
                locations: autoPopulated.locations.map((location) => ({
                  name: location.name,
                  description: location.description,
                })),
              }
            : undefined,
        creativeDecisions:
          authorDecisions.length > 0
            ? authorDecisions.map((decision) => ({
                type: decision.type,
                description: decision.description,
                severity: decision.severity,
              }))
            : undefined,
        metadata: {
          provider: finalProvider.type,
          model: finalProvider.model,
          tokens: bestResult.tokens,
          latencyMs,
          attempts,
          accepted,
          qualityFallback: usedQualityFallback,
          contextBeforeChars: contextWindow.before.length,
          contextAfterChars: contextWindow.after.length,
          scenePromptPlanId: scenePlan?.id,
          plannerModelUsed: scenePlan?.plannerModelUsed || undefined,
          embeddingModelUsed: scenePlan?.embeddingModelUsed || undefined,
        },
      });
    } catch (error) {
      deps.logger.error("Generation error", { error: String(error) });
      res.status(500).json({ error: String(error) });
    }
  });

  app.post("/api/generate/retry", async (req: Request, res: Response) => {
    deps.trackRequest("/api/generate/retry");
    try {
      const {
        previousText,
        feedback,
        contextBefore,
        contextAfter,
        projectId,
        chapterId,
      } = req.body;

      if (!previousText || typeof previousText !== "string") {
        return res
          .status(400)
          .json({ error: "previousText must be a non-empty string" });
      }
      if (!feedback || typeof feedback !== "string") {
        return res
          .status(400)
          .json({ error: "feedback must be a non-empty string" });
      }
      if (contextBefore !== undefined && typeof contextBefore !== "string") {
        return res
          .status(400)
          .json({ error: "contextBefore must be a string" });
      }
      if (contextAfter !== undefined && typeof contextAfter !== "string") {
        return res.status(400).json({ error: "contextAfter must be a string" });
      }
      if (previousText.length > 50000) {
        return res
          .status(400)
          .json({ error: "previousText exceeds maximum length" });
      }
      if (feedback.length > 5000) {
        return res
          .status(400)
          .json({ error: "feedback exceeds maximum length" });
      }
      if (projectId !== undefined && typeof projectId !== "string") {
        return res.status(400).json({ error: "projectId must be a string" });
      }
      if (chapterId !== undefined && typeof chapterId !== "string") {
        return res.status(400).json({ error: "chapterId must be a string" });
      }

      const baseSystemPrompt =
        "You are a skilled creative writer. Rewrite the text based on feedback. Output ONLY the rewritten story text.";
      const baseUserPrompt = `Rewrite this text based on the feedback.

ORIGINAL TEXT:
${previousText}

FEEDBACK:
${feedback}

CONTEXT BEFORE:
${(contextBefore || "").slice(-deps.tokenLimits.RETRY_GENERATION.input)}

CONTEXT AFTER:
${(contextAfter || "").slice(0, deps.tokenLimits.RETRY_GENERATION.input)}

Write an improved version that addresses the feedback and fits naturally between the before/after context. Output ONLY the rewritten text.`;
      let { text } = await deps.chatCompletion(
        baseSystemPrompt,
        baseUserPrompt,
        {
          temperature: 0.7,
          maxTokens: deps.tokenLimits.RETRY_GENERATION.output,
        },
      );

      let retryIssues = collectGenerationQualityIssues(
        text,
        contextBefore || "",
      );
      if (retryIssues.length > 0) {
        const retryResult = await deps.chatCompletion(
          baseSystemPrompt,
          `${baseUserPrompt}

${buildQualityRetryInstruction(retryIssues)}
- Do not summarize the scene or collapse into generic thriller narration.`,
          {
            temperature: 0.55,
            maxTokens: deps.tokenLimits.RETRY_GENERATION.output,
          },
        );
        text = retryResult.text;
        retryIssues = collectGenerationQualityIssues(text, contextBefore || "");
      }

      const rewriteFallback = retryIssues.length > 0;
      if (rewriteFallback && !text.trim()) {
        return res.status(422).json({
          error: `Rewrite blocked for repetitive or low-quality output: ${retryIssues.join("; ")}`,
        });
      }

      if (rewriteFallback) {
        deps.logger.error(
          "Returning rewrite despite residual quality flags to avoid paid blank result",
          {
            issues: retryIssues,
          },
        );
      }

      const recoveryDraftId = persistRecoverableDraft({
        projectId,
        chapterId,
        text,
        wordCount: text.split(/\s+/).filter(Boolean).length,
        source: rewriteFallback
          ? "interactive_retry_fallback"
          : "interactive_retry",
        prompt: feedback,
        metadata: {
          qualityFallback: rewriteFallback,
          qualityIssues: retryIssues,
        },
      });

      deps.lifetimeMemory.feedbackHistory.push({
        generatedText: previousText,
        feedback: "rejected",
        reason: feedback,
        timestamp: new Date().toISOString(),
      });
      deps.lifetimeMemory.insights = deriveLifetimeInsights(
        deps.lifetimeMemory,
      );
      if (projectId) {
        recordProjectPreference({
          memory: deps.lifetimeMemory,
          projectId,
          content: feedback,
          source: "retry-feedback",
          strength: 0.78,
        });
        deps.lifetimeMemory.insights = deriveLifetimeInsights(
          deps.lifetimeMemory,
        );
      }
      deps.persistLifetimeMemory();
      learnFromFeedback(previousText, feedback, false);

      res.json({
        text,
        wordCount: text.split(/\s+/).filter(Boolean).length,
        qualityIssues: retryIssues,
        qualityFallback: rewriteFallback,
        recoveryDraftId,
      });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  app.post(
    "/api/prompt-planner/scene-pack",
    async (req: Request, res: Response) => {
      deps.trackRequest("/api/prompt-planner/scene-pack");
      try {
        const {
          projectId,
          chapterId,
          sceneGoal = "",
          contextBefore = "",
          contextAfter = "",
        } = req.body;
        if (!projectId || typeof projectId !== "string") {
          return res.status(400).json({ error: "projectId is required" });
        }
        if (chapterId !== undefined && typeof chapterId !== "string") {
          return res.status(400).json({ error: "chapterId must be a string" });
        }
        if (typeof sceneGoal !== "string" || !sceneGoal.trim()) {
          return res
            .status(400)
            .json({ error: "sceneGoal must be a non-empty string" });
        }
        if (
          typeof contextBefore !== "string" ||
          typeof contextAfter !== "string"
        ) {
          return res
            .status(400)
            .json({ error: "contextBefore/contextAfter must be strings" });
        }

        const project = deps.projects.get(projectId);
        if (!project) {
          return res.status(404).json({ error: "Project not found" });
        }

        const plan = await deps.buildScenePromptPlan(
          project,
          chapterId,
          sceneGoal,
          contextBefore,
          contextAfter,
        );
        if (!plan) {
          return res.status(422).json({
            error: "Unable to build scene plan from current project context",
          });
        }

        res.json(plan);
      } catch (error) {
        deps.logger.error("Scene planner error", { error: String(error) });
        res.status(500).json({ error: String(error) });
      }
    },
  );

  app.get("/api/prompt-planner/history", (req: Request, res: Response) => {
    deps.trackRequest("/api/prompt-planner/history");
    const projectId = req.query.projectId as string | undefined;
    const chapterId = req.query.chapterId as string | undefined;
    const limit = Math.min(
      200,
      Math.max(1, parseInt((req.query.limit as string) || "50", 10)),
    );
    const history = deps.getPromptPlanHistory(projectId, chapterId, limit);
    res.json(history);
  });
}
