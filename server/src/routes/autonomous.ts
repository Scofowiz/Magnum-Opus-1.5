import type { Express, Request, Response } from "express";
import { convert as htmlToPlainText } from "html-to-text";
import { CONFIG, TOKEN_LIMITS } from "../core/config.js";
import { createLogger } from "../core/logger.js";
import type {
  AutonomousSession,
  ContextWindow,
  Project,
  UserPreferences,
} from "../domain/magnum.js";
import {
  resolveAutonomousChapterEndDecision,
  resolveAutonomousIterationTarget,
} from "../services/autonomous/chapterProgress.js";
import { resolveChapterOutlineForChapter } from "../services/projects/chapterOutline.js";
import { runApprovedGeneration } from "./generation.js";

interface AutonomousRoutesDeps {
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
  buildGenerationContext(
    project: Project,
    contextWindow: ContextWindow,
    userPrompt: string,
    options?: {
      chapterId?: string;
      narrativeState?: {
        time: string;
        location: string;
        povCharacter: string;
        mood: string;
      };
      continuityIndex?: unknown;
      selectedThreadIds?: string[];
      mandatoryBeat?: string;
      completedBeats?: string[];
      remainingPlotPoints?: string[];
      mode?: "manual" | "autonomous";
    },
  ): {
    systemPrompt: string;
    userMessage: string;
    debug: Record<string, unknown>;
  };
  updateContinuityIndex(project: Project): unknown;
  checkContinuity(
    newText: string,
    project: Project,
    options?: {
      chapterId?: string;
      povCharacterName?: string;
      recentContent?: string;
    },
  ): Promise<{
    issues: {
      type: string;
      description: string;
      severity: string;
      fixable: "text" | "bible" | "author";
    }[];
    score: number;
  }>;
  extractNarrativeState(
    recentText: string,
    signal?: AbortSignal,
  ): Promise<{
    time: string;
    location: string;
    povCharacter: string;
    mood: string;
  }>;
  polishText(
    text: string,
    narrativeState: {
      time: string;
      location: string;
      povCharacter: string;
      mood: string;
    },
    contextBefore: string,
    signal?: AbortSignal,
  ): Promise<string>;
  getProjects(): Map<string, Project>;
  getAutonomousSessions(): Map<string, AutonomousSession>;
  getSessionControllers(): Map<string, AbortController>;
  getUserPreferences(): UserPreferences;
  persistProjects(): void;
  persistSessions(): void;
  scoreQuality(
    text: string,
    context: string,
  ): Promise<{
    score: number;
    breakdown: Record<string, number>;
    feedback: string;
    violations?: string[];
  }>;
  trackRequest(endpoint: string): void;
  trackTokens(endpoint: string, tokens: number): void;
  db: {
    saveChapter(chapter: {
      id: string;
      projectId: string;
      title: string;
      content: string;
      wordCount: number;
      sortOrder: number;
    }): void;
    saveChapterWithHistory(entry: {
      chapterId: string;
      content: string;
      wordCount: number;
      trigger: string;
    }): void;
  };
}

type BookProgressSummary = {
  currentChapter: number;
  totalChapters: number;
  chaptersCompleted: number;
  totalBookWords: number;
} | null;

function toHtmlParagraphs(text: string): string {
  return text
    .split(/\n\n+/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0)
    .map((paragraph) => `<p>${paragraph.replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function projectChapterPlainText(content: string): string {
  return htmlToPlainText(content || "", {
    wordwrap: false,
    selectors: [
      { selector: "a", options: { ignoreHref: true } },
      { selector: "img", format: "skip" },
    ],
  })
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function registerAutonomousRoutes(
  app: Express,
  deps: AutonomousRoutesDeps,
): void {
  const autoLogger = createLogger("autonomous");

  const getChapterBeatState = (
    session: AutonomousSession,
    project: Project,
    chapter: Project["chapters"][number],
  ): {
    chapterBeats: string[];
    scopedBeats: string[];
    remainingPlotPoints: string[];
    completedScopedBeats: string[];
    mandatoryBeat: string;
  } => {
    const chapterOutline = resolveChapterOutlineForChapter(
      chapter,
      project.storyBible?.chapterOutlines,
    );
    const chapterBeats = chapterOutline?.beats || [];
    const scopedBeats =
      chapterBeats.length > 0
        ? session.plotPointsToHit.filter((point) =>
            chapterBeats.includes(point),
          )
        : session.plotPointsToHit;
    const remainingPlotPoints = scopedBeats.filter(
      (point) => !session.plotPointsHit.includes(point),
    );
    const completedScopedBeats = scopedBeats.filter((point) =>
      session.plotPointsHit.includes(point),
    );
    const mandatoryBeat = remainingPlotPoints[0] || "";

    return {
      chapterBeats,
      scopedBeats,
      remainingPlotPoints,
      completedScopedBeats,
      mandatoryBeat,
    };
  };

  const verifyCoveredBeats = async (
    beats: string[],
    text: string,
    signal?: AbortSignal,
  ): Promise<string[]> => {
    const candidateBeats = Array.from(
      new Set(beats.map((beat) => beat.trim()).filter(Boolean)),
    ).slice(0, 8);
    if (
      candidateBeats.length === 0 ||
      text.split(/\s+/).filter(Boolean).length < 300
    ) {
      return [];
    }

    const verifyPrompt = `You are a STRICT story editor evaluating whether chapter beats were FULLY dramatized in the cumulative chapter text.

BEATS TO CHECK:
${candidateBeats.map((beat, index) => `${index + 1}. ${beat}`).join("\n")}

TEXT WRITTEN:
"""
${text.slice(-30000)}
"""

STRICT CRITERIA - Mark a beat complete only if ALL of these are true:
1. The beat is shown through SCENES, not summary
2. Characters take meaningful actions related to this beat
3. There is dialogue or internal thought developing this beat
4. The beat receives at least 200+ words of focus
5. The reader would clearly understand this story moment happened

Return ONLY valid JSON in this shape:
{"completed":[1,3]}

Use beat numbers only.
- Include a number only when the beat was FULLY dramatized with scenes, action, and development.
- Exclude a number if the beat was skipped, merely mentioned, summarized, or underdeveloped.`;

    const { text: verification } = await deps.chatCompletion(
      "You are an extremely strict story editor. Only mark beats complete when they were fully dramatized, not merely mentioned or summarized.",
      verifyPrompt,
      {
        temperature: 0,
        maxTokens: TOKEN_LIMITS.BEAT_VERIFICATION.output,
        signal,
      },
    );

    try {
      const parsed = JSON.parse(verification) as { completed?: unknown };
      const completed = Array.isArray(parsed.completed) ? parsed.completed : [];
      return completed
        .map((value) => Number(value))
        .filter(
          (value) =>
            Number.isInteger(value) &&
            value >= 1 &&
            value <= candidateBeats.length,
        )
        .map((value) => candidateBeats[value - 1]);
    } catch {
      return [];
    }
  };

  const getBookProgress = (session: AutonomousSession): BookProgressSummary =>
    session.mode === "book"
      ? {
          currentChapter: session.currentChapterIndex + 1,
          totalChapters: session.chaptersToWrite.length,
          chaptersCompleted: session.chaptersCompleted.length,
          totalBookWords: session.totalBookWords,
        }
      : null;

  const clearPendingDraft = (session: AutonomousSession): void => {
    delete session.pendingDraft;
    delete session.pendingDraftWords;
    delete session.pendingDraftEndOfChapter;
    delete session.pendingDraftEndOfChapterReason;
  };

  const recordCommittedChunk = (
    session: AutonomousSession,
    chapterId: string,
    content: string,
    wordCount: number,
  ): void => {
    session.lastCommittedContent = content;
    session.lastCommittedWords = wordCount;
    session.lastCommittedAt = new Date().toISOString();
    session.lastCommittedChapterId = chapterId;
  };

  const setSessionPaused = (
    session: AutonomousSession,
    reason?: string,
  ): void => {
    session.status = "paused";
    session.pausedAt = new Date().toISOString();
    session.pauseReason = reason;
  };

  const setSessionRunning = (session: AutonomousSession): void => {
    session.status = "running";
    session.pausedAt = undefined;
    session.pauseReason = undefined;
  };

  const buildEnhancedGoal = (
    session: AutonomousSession,
    project: Project,
    mandatoryBeat: string,
  ): string =>
    [
      session.goal || "Continue the story following the Story Bible.",
      project.storyBible?.premise?.logline
        ? `Story north star: ${project.storyBible.premise.logline}`
        : "",
      mandatoryBeat ? `Immediate beat: ${mandatoryBeat}` : "",
      session.selectedThreads.length > 0
        ? "Prioritize the user-selected plot threads before any unselected thread."
        : "",
      "Write only the next scene prose for the active chapter.",
      "Continue from the exact end of the existing chapter text; pick up where it left off.",
      "Advance with fresh sentences, fresh dialogue, fresh paragraph structure.",
      "Earn chapter transitions, section headings, and future reveals in sequence — one beat at a time.",
      "Mark time, location, and POV shifts explicitly when they occur.",
    ]
      .filter(Boolean)
      .join("\n");

  const runIteration = async (
    session: AutonomousSession,
    isPreviewMode: boolean,
  ): Promise<Record<string, unknown>> => {
    const project = deps.getProjects().get(session.projectId);
    if (!project) {
      throw new Error("Project not found");
    }

    const chapter = project.chapters.find(
      (candidate) => candidate.id === session.chapterId,
    );
    if (!chapter) {
      throw new Error("Chapter not found");
    }

    const controller = new AbortController();
    deps.getSessionControllers().set(session.id, controller);
    const signal = controller.signal;

    try {
      const userPreferences = deps.getUserPreferences();
      const qualityThreshold = Math.max(
        0.1,
        Math.min(1, userPreferences.qualitySettings.minThreshold / 10),
      );
      const wordsPerIteration = resolveAutonomousIterationTarget({
        targetWords: session.targetWords,
        generatedWords: session.generatedWords,
        defaultWordsPerIteration: CONFIG.DEFAULT_WORDS_PER_ITERATION,
        maxWordsPerIteration: CONFIG.AUTONOMOUS_MAX_WORDS_PER_ITERATION,
      });
      const chapterPlainText = projectChapterPlainText(chapter.content);

      autoLogger.info("Extracting narrative state...");
      const narrativeState = await deps.extractNarrativeState(
        chapterPlainText,
        signal,
      );

      const {
        chapterBeats,
        scopedBeats,
        remainingPlotPoints,
        completedScopedBeats,
        mandatoryBeat,
      } = getChapterBeatState(session, project, chapter);
      const chapterOutline = resolveChapterOutlineForChapter(
        chapter,
        project.storyBible?.chapterOutlines,
      );

      const contextWindow: ContextWindow = {
        before: chapterPlainText.slice(-TOKEN_LIMITS.AUTONOMOUS_ITERATE.input),
        after: "",
        cursorPosition: chapterPlainText.length,
      };

      const continuityIndex = project.storyBible
        ? deps.updateContinuityIndex(project)
        : undefined;
      const { systemPrompt, userMessage, debug } = deps.buildGenerationContext(
        project,
        contextWindow,
        buildEnhancedGoal(session, project, mandatoryBeat),
        {
          chapterId: session.chapterId,
          narrativeState,
          continuityIndex,
          selectedThreadIds: session.selectedThreads,
          mandatoryBeat,
          completedBeats: completedScopedBeats,
          remainingPlotPoints,
          mode: "autonomous",
        },
      );

      autoLogger.info("Curated autonomous prompt built", {
        ...debug,
        previewMode: isPreviewMode,
        wordsPerIteration,
        mandatoryBeat,
        selectedThreadIds: session.selectedThreads,
        continuityIndexAvailable: !!continuityIndex,
      });

      const generationResult = await runApprovedGeneration(
        {
          chatCompletion: deps.chatCompletion,
          checkContinuity: deps.checkContinuity,
          scoreQuality: deps.scoreQuality,
          tokenLimits: {
            MAIN_GENERATION: TOKEN_LIMITS.MAIN_GENERATION,
            RETRY_GENERATION: TOKEN_LIMITS.RETRY_GENERATION,
          },
        },
        {
          chapterId: session.chapterId,
          checkQuality: true,
          contextBefore: chapterPlainText,
          enableContinuityChecks:
            userPreferences.memorySettings.enableContinuityChecks,
          frequencyPenalty:
            userPreferences.generationSettings.defaultFrequencyPenalty,
          logger: autoLogger,
          maxRetries: 4,
          mode: "autonomous",
          narrativeState,
          presencePenalty:
            userPreferences.generationSettings.defaultPresencePenalty,
          project,
          qualityThreshold,
          signal,
          systemPrompt,
          targetWords: wordsPerIteration,
          temperature: userPreferences.generationSettings.defaultTemperature,
          topP: userPreferences.generationSettings.defaultTopP,
          userMessage,
          chapterCompletion: {
            chapterTitle: chapter.title,
            chapterSummary: chapterOutline?.summary,
            chapterBeats,
            remainingBeats: remainingPlotPoints,
            chapterTargetWords: session.targetWords,
            chapterGeneratedWords: session.generatedWords,
          },
        },
      );

      const text = generationResult.text;
      const newWords = generationResult.wordCount;
      const blockedBySharedWriterQuality =
        generationResult.qualityScore < qualityThreshold ||
        generationResult.qualityIssues.length > 0;
      const pendingChapterEndDecision = resolveAutonomousChapterEndDecision({
        explicitEndSignal: generationResult.endOfChapter,
        remainingBeatCount: remainingPlotPoints.length,
        targetWords: session.targetWords,
        generatedWords: session.generatedWords + newWords,
        minimumWordRatio: CONFIG.AUTONOMOUS_MIN_CHAPTER_END_RATIO,
        minimumWordFloor: CONFIG.AUTONOMOUS_MIN_CHAPTER_END_FLOOR,
      });
      deps.trackTokens("/api/autonomous/iterate", generationResult.tokens);

      if (!generationResult.accepted && blockedBySharedWriterQuality) {
        if (text.trim()) {
          session.pendingDraft = text;
          session.pendingDraftWords = newWords;
          session.pendingDraftEndOfChapter =
            pendingChapterEndDecision.shouldHonorExplicitEnd;
          session.pendingDraftEndOfChapterReason =
            pendingChapterEndDecision.shouldHonorExplicitEnd
              ? generationResult.endOfChapterReason
              : undefined;
        } else {
          clearPendingDraft(session);
        }
        if (pendingChapterEndDecision.suppressedExplicitEnd) {
          autoLogger.info("Suppressing early chapter-end signal", {
            sessionId: session.id,
            chapterId: chapter.id,
            generatedWords: session.generatedWords + newWords,
            minimumWordsForExplicitEnd:
              pendingChapterEndDecision.minimumWordsForExplicitEnd,
            remainingBeats: remainingPlotPoints,
            reason: generationResult.endOfChapterReason,
          });
        }
        setSessionPaused(
          session,
          "Paused: autonomous draft failed the shared writer quality gate.",
        );
        deps.persistSessions();
        autoLogger.warn("Blocked autonomous draft via shared writer gate", {
          sessionId: session.id,
          qualityIssues: generationResult.qualityIssues,
          continuityIssues: generationResult.continuityIssues.map(
            (issue) => issue.description,
          ),
        });

        return {
          session,
          newContent: text,
          newWords,
          pendingDraft: session.pendingDraft,
          chapterContent: chapter.content,
          chapterWordCount: chapter.wordCount,
          totalProjectWords: project.wordCount,
          plotPointHit: null,
          narrativeState,
          chapterComplete: false,
          movingToNextChapter: false,
          nextChapterTitle: "",
          previewMode: true,
          qualityBlocked: true,
          qualityIssues: generationResult.qualityIssues,
          continuityScore: generationResult.continuityScore,
          continuityIssues: generationResult.continuityIssues,
          endOfChapter: pendingChapterEndDecision.shouldHonorExplicitEnd,
          endOfChapterReason: pendingChapterEndDecision.shouldHonorExplicitEnd
            ? generationResult.endOfChapterReason
            : undefined,
          bookProgress: getBookProgress(session),
        };
      }

      if (!generationResult.accepted && text.trim()) {
        autoLogger.info(
          "Autonomous draft cleared quality but missed shared writer length target; accepting iteration",
          {
            sessionId: session.id,
            chapterId: chapter.id,
            wordCount: generationResult.wordCount,
            minTargetWords: generationResult.minTargetWords,
            maxTargetWords: generationResult.maxTargetWords,
            qualityScore: generationResult.qualityScore,
          },
        );
      }

      if (!isPreviewMode) {
        chapter.content = (chapter.content || "") + toHtmlParagraphs(text);
        chapter.wordCount = chapter.content.split(/\s+/).filter(Boolean).length;
        project.content = project.chapters
          .map((candidate) => candidate.content)
          .join("\n\n");
        project.wordCount = project.chapters.reduce(
          (sum, candidate) => sum + candidate.wordCount,
          0,
        );
        project.updatedAt = new Date().toISOString();
        deps.persistProjects();

        try {
          deps.db.saveChapter({
            id: chapter.id,
            projectId: project.id,
            title: chapter.title,
            content: chapter.content,
            wordCount: chapter.wordCount,
            sortOrder: chapter.order || 0,
          });
          deps.db.saveChapterWithHistory({
            chapterId: chapter.id,
            content: chapter.content,
            wordCount: chapter.wordCount,
            trigger: "autonomous",
          });
        } catch (error) {
          autoLogger.error("SQLite save failed (JSON still saved)", {
            error: String(error),
          });
        }

        session.generatedWords += newWords;
        session.totalBookWords += newWords;
        session.iterations++;
        recordCommittedChunk(session, chapter.id, text, newWords);
      } else {
        session.pendingDraft = text;
        session.pendingDraftWords = newWords;
        session.pendingDraftEndOfChapter =
          pendingChapterEndDecision.shouldHonorExplicitEnd;
        session.pendingDraftEndOfChapterReason =
          pendingChapterEndDecision.shouldHonorExplicitEnd
            ? generationResult.endOfChapterReason
            : undefined;
        if (pendingChapterEndDecision.suppressedExplicitEnd) {
          autoLogger.info("Suppressing early chapter-end signal", {
            sessionId: session.id,
            chapterId: chapter.id,
            generatedWords: session.generatedWords + newWords,
            minimumWordsForExplicitEnd:
              pendingChapterEndDecision.minimumWordsForExplicitEnd,
            remainingBeats: remainingPlotPoints,
            reason: generationResult.endOfChapterReason,
          });
        }
        setSessionPaused(session);
      }

      let plotPointHit: string | null = null;
      if (!isPreviewMode && remainingPlotPoints.length > 0) {
        const chapterTextForVerification = projectChapterPlainText(
          chapter.content,
        );
        const verificationScope = remainingPlotPoints.slice(0, 8);
        autoLogger.info("Verifying cumulative beat coverage", {
          beats: verificationScope,
          chapterId: chapter.id,
        });
        try {
          const coveredBeats = await verifyCoveredBeats(
            verificationScope,
            chapterTextForVerification,
            signal,
          );
          autoLogger.info("Beat verification result", { coveredBeats });
          for (const beat of coveredBeats) {
            if (!session.plotPointsHit.includes(beat)) {
              session.plotPointsHit.push(beat);
            }
          }
          if (coveredBeats.length > 0) {
            plotPointHit = coveredBeats[0];
          }
        } catch (error) {
          autoLogger.error(
            "Beat verification failed, NOT marking beats as hit",
            error,
          );
        }
      }

      let chapterComplete = false;
      let movingToNextChapter = false;
      let nextChapterTitle = "";

      const chapterBeatsRemaining =
        chapterBeats.length > 0
          ? scopedBeats.filter(
              (point) => !session.plotPointsHit.includes(point),
            )
          : [];
      const chapterEndDecision = resolveAutonomousChapterEndDecision({
        explicitEndSignal: generationResult.endOfChapter,
        remainingBeatCount: chapterBeatsRemaining.length,
        targetWords: session.targetWords,
        generatedWords: session.generatedWords,
        minimumWordRatio: CONFIG.AUTONOMOUS_MIN_CHAPTER_END_RATIO,
        minimumWordFloor: CONFIG.AUTONOMOUS_MIN_CHAPTER_END_FLOOR,
      });
      const chapterShouldEndNow = chapterEndDecision.shouldHonorExplicitEnd;

      if (chapterEndDecision.suppressedExplicitEnd) {
        autoLogger.info("Suppressing early chapter-end signal", {
          sessionId: session.id,
          chapterId: chapter.id,
          generatedWords: session.generatedWords,
          minimumWordsForExplicitEnd:
            chapterEndDecision.minimumWordsForExplicitEnd,
          remainingBeats: chapterBeatsRemaining,
          reason: generationResult.endOfChapterReason,
        });
      }

      const chapterOverflowLimit = Math.ceil(session.targetWords * 1.3);
      if (
        !isPreviewMode &&
        !chapterShouldEndNow &&
        chapterBeatsRemaining.length > 0 &&
        session.generatedWords >= chapterOverflowLimit
      ) {
        const reason =
          "Paused: chapter exceeded its target before the required beat landed. Review the current chapter output or refine the chapter beats before continuing.";
        autoLogger.warn("Pausing autonomous session after chapter overflow", {
          sessionId: session.id,
          chapterId: session.chapterId,
          generatedWords: session.generatedWords,
          targetWords: session.targetWords,
          remainingBeats: chapterBeatsRemaining,
        });
        setSessionPaused(session, reason);
        deps.persistSessions();

        return {
          session,
          newContent: text,
          newWords,
          pendingDraft: undefined,
          chapterContent: chapter.content,
          chapterWordCount: chapter.wordCount,
          totalProjectWords: project.wordCount,
          plotPointHit,
          narrativeState,
          chapterComplete: false,
          movingToNextChapter: false,
          nextChapterTitle: "",
          previewMode: false,
          bookProgress: getBookProgress(session),
        };
      }

      if (
        chapterShouldEndNow ||
        (chapterBeatsRemaining.length === 0 &&
          session.generatedWords >= session.targetWords)
      ) {
        chapterComplete = true;
        session.chaptersCompleted.push(session.chapterId);

        if (chapterShouldEndNow && chapterBeatsRemaining.length > 0) {
          autoLogger.info("Closing chapter on explicit chapter-end signal", {
            sessionId: session.id,
            chapterId: chapter.id,
            remainingBeats: chapterBeatsRemaining,
            reason: generationResult.endOfChapterReason,
          });
        }

        if (session.mode === "book") {
          if (
            session.currentChapterIndex <
            session.chaptersToWrite.length - 1
          ) {
            session.currentChapterIndex++;
            session.chapterId =
              session.chaptersToWrite[session.currentChapterIndex];
            session.generatedWords = 0;
            session.iterations = 0;
            movingToNextChapter = true;

            const nextChapter = project.chapters.find(
              (candidate) => candidate.id === session.chapterId,
            );
            nextChapterTitle =
              nextChapter?.title ||
              `Chapter ${session.currentChapterIndex + 1}`;
            autoLogger.info("Moving to next chapter", {
              chapterIndex: session.currentChapterIndex,
              chapterId: session.chapterId,
              chaptersCompleted: session.chaptersCompleted.length,
              totalChapters: session.chaptersToWrite.length,
            });
          } else {
            session.status = "completed";
            session.completedAt = new Date().toISOString();
            autoLogger.info("Session completed", {
              mode: session.mode,
              chaptersCompleted: session.chaptersCompleted.length,
              totalBookWords: session.totalBookWords,
            });
          }
        } else {
          session.status = "completed";
          session.completedAt = new Date().toISOString();
        }
      }

      autoLogger.info("Iteration complete", {
        newWords,
        totalGenerated: session.generatedWords,
        totalBookWords: session.totalBookWords,
        previewMode: isPreviewMode,
      });

      deps.persistSessions();

      return {
        session,
        newContent: text,
        newWords,
        pendingDraft: isPreviewMode ? session.pendingDraft : undefined,
        chapterContent: chapter.content,
        chapterWordCount: chapter.wordCount,
        totalProjectWords: project.wordCount,
        plotPointHit,
        narrativeState,
        chapterComplete: isPreviewMode ? false : chapterComplete,
        movingToNextChapter: isPreviewMode ? false : movingToNextChapter,
        nextChapterTitle: isPreviewMode ? "" : nextChapterTitle,
        previewMode: isPreviewMode,
        continuityScore: generationResult.continuityScore,
        continuityIssues: generationResult.continuityIssues,
        endOfChapter: chapterShouldEndNow,
        endOfChapterReason: chapterShouldEndNow
          ? generationResult.endOfChapterReason
          : undefined,
        bookProgress: getBookProgress(session),
      };
    } finally {
      deps.getSessionControllers().delete(session.id);
    }
  };

  const runBackgroundIteration = async (
    session: AutonomousSession,
  ): Promise<void> => {
    if (
      session.status !== "running" ||
      !session.autoIterate ||
      !!session.pendingDraft ||
      deps.getSessionControllers().has(session.id)
    ) {
      return;
    }

    try {
      await runIteration(session, !session.autoAccept);
    } catch (error) {
      if (error instanceof Error && error.message === "Aborted") {
        return;
      }
      const reason =
        error instanceof Error
          ? error.message
          : "Background autonomous iteration failed";
      autoLogger.error("Background autonomous iteration failed", {
        sessionId: session.id,
        error: reason,
      });
      setSessionPaused(session, reason);
      deps.persistSessions();
    }
  };

  setInterval(() => {
    for (const session of deps.getAutonomousSessions().values()) {
      void runBackgroundIteration(session);
    }
  }, 2500);

  app.post(
    "/api/autonomous/start",
    (req: Request, res: Response): Response | void => {
      deps.trackRequest("/api/autonomous/start");
      const {
        projectId,
        chapterId,
        actNumber = 1,
        goal,
        targetWords = CONFIG.DEFAULT_TARGET_WORDS,
        plotPointsToHit = [],
        selectedThreads = [],
        mode = "chapter",
        chaptersToWrite = [],
        wordsPerChapter = CONFIG.DEFAULT_TARGET_WORDS,
        autoIterate = true,
        autoAccept = false,
      } = req.body;

      if (!projectId || typeof projectId !== "string") {
        return res.status(400).json({ error: "Invalid projectId" });
      }
      if (mode !== "chapter" && mode !== "book") {
        return res
          .status(400)
          .json({ error: 'Invalid mode. Must be "chapter" or "book"' });
      }
      if (mode === "chapter" && (!chapterId || typeof chapterId !== "string")) {
        return res
          .status(400)
          .json({ error: "chapterId is required for chapter mode" });
      }
      if (
        typeof targetWords !== "number" ||
        targetWords < 100 ||
        targetWords > 100000
      ) {
        return res
          .status(400)
          .json({ error: "targetWords must be between 100 and 100000" });
      }
      if (
        typeof wordsPerChapter !== "number" ||
        wordsPerChapter < 100 ||
        wordsPerChapter > 100000
      ) {
        return res
          .status(400)
          .json({ error: "wordsPerChapter must be between 100 and 100000" });
      }
      if (!Array.isArray(plotPointsToHit)) {
        return res
          .status(400)
          .json({ error: "plotPointsToHit must be an array" });
      }
      if (!Array.isArray(selectedThreads)) {
        return res
          .status(400)
          .json({ error: "selectedThreads must be an array" });
      }
      if (!Array.isArray(chaptersToWrite)) {
        return res
          .status(400)
          .json({ error: "chaptersToWrite must be an array" });
      }

      const project = deps.getProjects().get(projectId);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      let chapterIds: string[] = [];
      if (mode === "book") {
        const targetCount = project.storyBible?.chapterOutlines?.length || 10;
        if (project.chapters.length < targetCount) {
          for (
            let index = project.chapters.length;
            index < targetCount;
            index++
          ) {
            const outline = project.storyBible?.chapterOutlines?.[index];
            project.chapters.push({
              id: crypto.randomUUID(),
              title: outline?.title || `Chapter ${index + 1}`,
              content: "",
              wordCount: 0,
              order: index,
            });
          }
          deps.persistProjects();
          createLogger("autonomous").info(
            `Created chapters up to ${targetCount} for book mode`,
          );
        }

        const requestedChapterIds =
          chaptersToWrite.length > 0
            ? chaptersToWrite
            : project.chapters.map((chapter) => chapter.id);

        const chapterOrder = new Map(
          project.chapters.map((chapter) => [chapter.id, chapter.order]),
        );
        chapterIds = requestedChapterIds
          .filter(
            (chapterId): chapterId is string =>
              typeof chapterId === "string" && chapterOrder.has(chapterId),
          )
          .sort(
            (left, right) =>
              (chapterOrder.get(left) || 0) - (chapterOrder.get(right) || 0),
          );

        if (chapterIds.length === 0) {
          return res.status(400).json({ error: "No chapters available" });
        }
      } else {
        const chapter = project.chapters.find(
          (candidate) => candidate.id === chapterId,
        );
        if (!chapter) {
          return res.status(404).json({ error: "Chapter not found" });
        }
        chapterIds = [chapterId];
      }

      const session: AutonomousSession = {
        id: crypto.randomUUID(),
        projectId,
        chapterId: chapterIds[0],
        actNumber,
        status: autoIterate ? "running" : "paused",
        autoIterate: Boolean(autoIterate),
        autoAccept: Boolean(autoAccept),
        goal: goal || "Continue the story following the Story Bible",
        targetWords: mode === "book" ? wordsPerChapter : targetWords,
        generatedWords: 0,
        iterations: 0,
        plotPointsToHit,
        plotPointsHit: [],
        selectedThreads: selectedThreads.filter(
          (threadId: unknown): threadId is string =>
            typeof threadId === "string",
        ),
        startedAt: new Date().toISOString(),
        mode,
        chaptersToWrite: chapterIds,
        currentChapterIndex: 0,
        chaptersCompleted: [],
        totalBookWords: 0,
        wordsPerChapter,
      };

      deps.getAutonomousSessions().set(session.id, session);
      deps.persistSessions();
      createLogger("autonomous").info("Started autonomous session", {
        sessionId: session.id,
        mode,
        chaptersToWrite: chapterIds,
        chapterCount: chapterIds.length,
        firstChapterId: session.chapterId,
        targetWordsPerChapter: session.targetWords,
        wordsPerChapter,
        selectedThreads: session.selectedThreads,
      });
      res.json(session);
    },
  );

  app.get(
    "/api/autonomous/:sessionId",
    (req: Request, res: Response): Response | void => {
      deps.trackRequest("/api/autonomous/:sessionId");
      const session = deps.getAutonomousSessions().get(req.params.sessionId);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }
      res.json(session);
    },
  );

  app.get(
    "/api/autonomous",
    (_req: Request, res: Response): Response | void => {
      deps.trackRequest("/api/autonomous");
      const activeSessions = Array.from(deps.getAutonomousSessions().entries())
        .filter(
          ([, session]) =>
            session.status === "running" || session.status === "paused",
        )
        .map(([id, session]) => ({
          id,
          projectId: session.projectId,
          chapterId: session.chapterId,
          status: session.status,
          mode: session.mode,
          selectedThreads: session.selectedThreads,
          generatedWords: session.generatedWords,
          targetWords: session.targetWords,
          totalBookWords: session.totalBookWords,
          currentChapterIndex: session.currentChapterIndex,
          chaptersCompleted: session.chaptersCompleted?.length || 0,
          startedAt: session.startedAt,
        }));
      res.json(activeSessions);
    },
  );

  app.post(
    "/api/autonomous/:sessionId/settings",
    (req: Request, res: Response): Response | void => {
      deps.trackRequest("/api/autonomous/:sessionId/settings");
      const session = deps.getAutonomousSessions().get(req.params.sessionId);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }

      const { autoIterate, autoAccept } = req.body;
      if (autoIterate !== undefined && typeof autoIterate !== "boolean") {
        return res.status(400).json({ error: "autoIterate must be a boolean" });
      }
      if (autoAccept !== undefined && typeof autoAccept !== "boolean") {
        return res.status(400).json({ error: "autoAccept must be a boolean" });
      }

      if (typeof autoIterate === "boolean") {
        session.autoIterate = autoIterate;

        if (!autoIterate && session.status === "running") {
          const controller = deps.getSessionControllers().get(session.id);
          if (controller) {
            controller.abort();
            deps.getSessionControllers().delete(session.id);
          }
          setSessionPaused(session);
        } else if (
          autoIterate &&
          session.status === "paused" &&
          !session.pendingDraft &&
          !session.completedAt
        ) {
          setSessionRunning(session);
        }
      }

      if (typeof autoAccept === "boolean") {
        session.autoAccept = autoAccept;
      }

      deps.persistSessions();
      res.json(session);
    },
  );

  app.post(
    "/api/autonomous/:sessionId/iterate",
    async (req: Request, res: Response): Promise<Response | void> => {
      deps.trackRequest("/api/autonomous/:sessionId/iterate");
      const session = deps.getAutonomousSessions().get(req.params.sessionId);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }

      const isPreviewMode = req.query.preview === "true";
      if (session.status !== "running" && !isPreviewMode) {
        return res.status(400).json({ error: "Session is not running" });
      }

      try {
        const result = await runIteration(session, isPreviewMode);
        res.json(result);
      } catch (error) {
        if (error instanceof Error && error.message === "Aborted") {
          autoLogger.info("Iteration aborted by controller", {
            sessionId: session.id,
          });
          return res.status(499).json({ error: "Iteration aborted" });
        }

        const errorString = String(error);
        autoLogger.error("Autonomous iteration error", { error: errorString });
        if (errorString.includes("rate") || errorString.includes("429")) {
          res.status(429).json({
            error: "Rate limited by AI provider. Will retry automatically.",
          });
        } else if (
          errorString.includes("timeout") ||
          errorString.includes("ETIMEDOUT")
        ) {
          res
            .status(504)
            .json({ error: "Request timeout. Will retry automatically." });
        } else if (
          errorString.includes("API key") ||
          errorString.includes("Unauthorized") ||
          errorString.includes("401")
        ) {
          res
            .status(401)
            .json({ error: "API key invalid or expired. Check Settings." });
        } else {
          res.status(500).json({ error: errorString });
        }
      }
    },
  );

  app.get(
    "/api/autonomous/:sessionId/stream",
    async (req: Request, res: Response): Promise<Response | void> => {
      deps.trackRequest("/api/autonomous/:sessionId/stream");
      const session = deps.getAutonomousSessions().get(req.params.sessionId);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }

      const project = deps.getProjects().get(session.projectId);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      const chapter = project.chapters.find(
        (candidate) => candidate.id === session.chapterId,
      );
      if (!chapter) {
        return res.status(404).json({ error: "Chapter not found" });
      }

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders();

      const sendEvent = (event: string, data: unknown): void => {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      };

      try {
        const controller = new AbortController();
        deps.getSessionControllers().set(session.id, controller);
        const signal = controller.signal;

        const wordsPerIteration = resolveAutonomousIterationTarget({
          targetWords: session.targetWords,
          generatedWords: session.generatedWords,
          defaultWordsPerIteration: CONFIG.DEFAULT_WORDS_PER_ITERATION,
          maxWordsPerIteration: CONFIG.AUTONOMOUS_MAX_WORDS_PER_ITERATION,
        });
        const chapterPlainText = projectChapterPlainText(chapter.content);

        sendEvent("status", { message: "Analyzing narrative state..." });
        const narrativeState = await deps.extractNarrativeState(
          chapterPlainText,
          signal,
        );
        sendEvent("narrative", narrativeState);

        const chapterOutline = resolveChapterOutlineForChapter(
          chapter,
          project.storyBible?.chapterOutlines,
        );
        const chapterBeats = chapterOutline?.beats || [];
        const scopedBeats =
          chapterBeats.length > 0
            ? session.plotPointsToHit.filter((point) =>
                chapterBeats.includes(point),
              )
            : session.plotPointsToHit;
        const remainingPlotPoints = scopedBeats.filter(
          (point) => !session.plotPointsHit.includes(point),
        );
        const mandatoryBeat = remainingPlotPoints[0] || "";
        const completedScopedBeats = scopedBeats.filter((point) =>
          session.plotPointsHit.includes(point),
        );

        const contextWindow: ContextWindow = {
          before: chapterPlainText.slice(
            -TOKEN_LIMITS.AUTONOMOUS_ITERATE.input,
          ),
          after: "",
          cursorPosition: chapterPlainText.length,
        };

        const enhancedGoal = buildEnhancedGoal(session, project, mandatoryBeat);

        const continuityIndex = project.storyBible
          ? deps.updateContinuityIndex(project)
          : undefined;
        const { systemPrompt, userMessage, debug } =
          deps.buildGenerationContext(project, contextWindow, enhancedGoal, {
            chapterId: session.chapterId,
            narrativeState,
            continuityIndex,
            selectedThreadIds: session.selectedThreads,
            mandatoryBeat,
            completedBeats: completedScopedBeats,
            remainingPlotPoints,
            mode: "autonomous",
          });

        sendEvent("prompt-context", {
          ...debug,
          wordsPerIteration,
          mandatoryBeat,
          continuityIndexAvailable: !!continuityIndex,
        });
        sendEvent("status", { message: "Generating..." });

        const { text: rawText, tokens } = await deps.chatCompletion(
          systemPrompt,
          `${userMessage}\n\nWrite approximately ${wordsPerIteration} words. Continue directly from the existing scene, stay inside the active chapter, and stop at a clean handoff point for the next iteration. Do not add chapter headings or outline labels.`,
          {
            temperature: 0.8,
            maxTokens: TOKEN_LIMITS.AUTONOMOUS_ITERATE.output,
            signal,
          },
        );

        sendEvent("chunk", { text: rawText, accumulated: rawText.length });
        sendEvent("status", { message: "Polishing..." });

        const text = await deps.polishText(
          rawText,
          narrativeState,
          chapterPlainText,
          signal,
        );
        const newWords = text.split(/\s+/).filter(Boolean).length;

        chapter.content = (chapter.content || "") + toHtmlParagraphs(text);
        chapter.wordCount = chapter.content.split(/\s+/).filter(Boolean).length;
        project.content = project.chapters
          .map((candidate) => candidate.content)
          .join("\n\n");
        project.wordCount = project.chapters.reduce(
          (sum, candidate) => sum + candidate.wordCount,
          0,
        );
        project.updatedAt = new Date().toISOString();
        deps.persistProjects();

        session.generatedWords += newWords;
        session.iterations++;
        deps.trackTokens("/api/autonomous/stream", tokens);

        let plotPointHit: string | null = null;
        for (const plotPoint of remainingPlotPoints) {
          const keywords = plotPoint
            .toLowerCase()
            .split(/\s+/)
            .filter((word) => word.length > 4);
          const textLower = text.toLowerCase();
          const matchCount = keywords.filter((keyword) =>
            textLower.includes(keyword),
          ).length;
          if (
            matchCount > 0 &&
            matchCount / keywords.length > CONFIG.BEAT_KEYWORD_MATCH_THRESHOLD
          ) {
            session.plotPointsHit.push(plotPoint);
            plotPointHit = plotPoint;
            break;
          }
        }

        if (session.generatedWords >= session.targetWords) {
          session.status = "completed";
          session.completedAt = new Date().toISOString();
        }

        deps.persistSessions();
        deps.getSessionControllers().delete(session.id);

        sendEvent("complete", {
          session,
          finalText: text,
          newWords,
          chapterWordCount: chapter.wordCount,
          totalProjectWords: project.wordCount,
          plotPointHit,
          narrativeState,
        });
        res.end();
      } catch (error) {
        sendEvent("error", { message: String(error) });
        res.end();
      }
    },
  );

  app.post(
    "/api/autonomous/:sessionId/accept",
    async (req: Request, res: Response) => {
      deps.trackRequest("/api/autonomous/:sessionId/accept");
      const session = deps.getAutonomousSessions().get(req.params.sessionId);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }

      const { content, wordCount } = req.body;
      if (!content || typeof content !== "string") {
        return res
          .status(400)
          .json({ error: "Content must be a non-empty string" });
      }
      if (content.length > 100000) {
        return res.status(400).json({
          error: "Content exceeds maximum length of 100000 characters",
        });
      }
      if (
        wordCount !== undefined &&
        (typeof wordCount !== "number" || wordCount < 0)
      ) {
        return res
          .status(400)
          .json({ error: "wordCount must be a non-negative number" });
      }
      if (session.status === "completed" || session.status === "stopped") {
        return res
          .status(400)
          .json({ error: "Cannot accept content for a finished session" });
      }

      const project = deps.getProjects().get(session.projectId);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      const chapter = project.chapters.find(
        (candidate) => candidate.id === session.chapterId,
      );
      if (!chapter) {
        return res.status(404).json({ error: "Chapter not found" });
      }

      const newWords = wordCount || content.split(/\s+/).filter(Boolean).length;
      chapter.content = (chapter.content || "") + toHtmlParagraphs(content);
      chapter.wordCount = chapter.content.split(/\s+/).filter(Boolean).length;
      project.content = project.chapters
        .map((candidate) => candidate.content)
        .join("\n\n");
      project.wordCount = project.chapters.reduce(
        (sum, candidate) => sum + candidate.wordCount,
        0,
      );
      project.updatedAt = new Date().toISOString();
      deps.persistProjects();

      try {
        deps.db.saveChapter({
          id: chapter.id,
          projectId: project.id,
          title: chapter.title,
          content: chapter.content,
          wordCount: chapter.wordCount,
          sortOrder: chapter.order || 0,
        });
        deps.db.saveChapterWithHistory({
          chapterId: chapter.id,
          content: chapter.content,
          wordCount: chapter.wordCount,
          trigger: "autonomous",
        });
      } catch (error) {
        createLogger("autonomous").error(
          "SQLite save failed (JSON still saved)",
          { error: String(error) },
        );
      }

      session.generatedWords += newWords;
      session.totalBookWords += newWords;
      session.iterations++;
      recordCommittedChunk(session, chapter.id, content, newWords);

      let chapterComplete = false;
      let movingToNextChapter = false;
      let nextChapterTitle = "";
      const completedChapterId = session.chapterId;

      const { chapterBeats, scopedBeats } = getChapterBeatState(
        session,
        project,
        chapter,
      );

      let plotPointHit: string | null = null;
      if (scopedBeats.length > 0) {
        const chapterTextForVerification = projectChapterPlainText(
          chapter.content,
        );
        const verificationScope = scopedBeats
          .filter((point) => !session.plotPointsHit.includes(point))
          .slice(0, 8);
        try {
          const coveredBeats = await verifyCoveredBeats(
            verificationScope,
            chapterTextForVerification,
          );
          for (const beat of coveredBeats) {
            if (!session.plotPointsHit.includes(beat)) {
              session.plotPointsHit.push(beat);
            }
          }
          if (coveredBeats.length > 0) {
            plotPointHit = coveredBeats[0];
          }
        } catch (error) {
          createLogger("autonomous").error(
            "Beat verification failed during accept",
            { error: String(error) },
          );
        }
      }

      const chapterBeatsRemaining =
        chapterBeats.length > 0
          ? scopedBeats.filter(
              (point) => !session.plotPointsHit.includes(point),
            )
          : [];
      const chapterEndDecision = resolveAutonomousChapterEndDecision({
        explicitEndSignal: session.pendingDraftEndOfChapter === true,
        remainingBeatCount: chapterBeatsRemaining.length,
        targetWords: session.targetWords,
        generatedWords: session.generatedWords,
        minimumWordRatio: CONFIG.AUTONOMOUS_MIN_CHAPTER_END_RATIO,
        minimumWordFloor: CONFIG.AUTONOMOUS_MIN_CHAPTER_END_FLOOR,
      });
      const endOfChapter = chapterEndDecision.shouldHonorExplicitEnd;
      const endOfChapterReason = endOfChapter
        ? session.pendingDraftEndOfChapterReason
        : undefined;

      if (chapterEndDecision.suppressedExplicitEnd) {
        createLogger("autonomous").info(
          "Suppressing early chapter-end signal",
          {
            sessionId: session.id,
            chapterId: completedChapterId,
            generatedWords: session.generatedWords,
            minimumWordsForExplicitEnd:
              chapterEndDecision.minimumWordsForExplicitEnd,
            remainingBeats: chapterBeatsRemaining,
            reason: session.pendingDraftEndOfChapterReason,
          },
        );
      }

      if (
        endOfChapter ||
        (chapterBeatsRemaining.length === 0 &&
          session.generatedWords >= session.targetWords)
      ) {
        chapterComplete = true;
        session.chaptersCompleted.push(session.chapterId);

        if (endOfChapter && chapterBeatsRemaining.length > 0) {
          createLogger("autonomous").info(
            "Accept closing chapter on explicit chapter-end signal",
            {
              sessionId: session.id,
              chapterId: completedChapterId,
              remainingBeats: chapterBeatsRemaining,
              reason: endOfChapterReason,
            },
          );
        }

        if (session.mode === "book") {
          if (
            session.currentChapterIndex <
            session.chaptersToWrite.length - 1
          ) {
            session.currentChapterIndex++;
            session.chapterId =
              session.chaptersToWrite[session.currentChapterIndex];
            session.generatedWords = 0;
            session.iterations = 0;
            movingToNextChapter = true;

            const nextChapter = project.chapters.find(
              (candidate) => candidate.id === session.chapterId,
            );
            nextChapterTitle =
              nextChapter?.title ||
              `Chapter ${session.currentChapterIndex + 1}`;
            createLogger("autonomous").info("Moving to next chapter", {
              chapterIndex: session.currentChapterIndex,
              chapterId: session.chapterId,
              chaptersCompleted: session.chaptersCompleted.length,
              totalChapters: session.chaptersToWrite.length,
            });
          } else {
            session.status = "completed";
            session.completedAt = new Date().toISOString();
            createLogger("autonomous").info(
              "Book session completed - all selected chapters done",
              {
                chaptersCompleted: session.chaptersCompleted.length,
                totalBookWords: session.totalBookWords,
              },
            );
          }
        } else {
          session.status = "completed";
          session.completedAt = new Date().toISOString();
        }
      }

      createLogger("autonomous").info("Content accepted", {
        newWords,
        totalGenerated: session.generatedWords,
        targetWords: session.targetWords,
        completedChapterId,
        mode: session.mode,
        currentChapterIndex: session.currentChapterIndex,
        chaptersToWriteCount: session.chaptersToWrite.length,
        chapterComplete,
        endOfChapter,
        endOfChapterReason,
        movingToNextChapter,
        nextChapterId: movingToNextChapter ? session.chapterId : null,
      });

      clearPendingDraft(session);
      if (session.status !== "completed") {
        if (session.autoIterate) {
          setSessionRunning(session);
        } else {
          setSessionPaused(session);
        }
      }
      deps.persistSessions();

      res.json({
        session,
        completedChapterId,
        chapterContent: chapter.content,
        chapterWordCount: chapter.wordCount,
        totalProjectWords: project.wordCount,
        plotPointHit,
        chapterComplete,
        movingToNextChapter,
        nextChapterTitle,
        endOfChapter,
        endOfChapterReason,
        chapters: project.chapters,
        bookProgress: getBookProgress(session),
      });
    },
  );

  app.post(
    "/api/autonomous/:sessionId/reject",
    (req: Request, res: Response) => {
      deps.trackRequest("/api/autonomous/:sessionId/reject");
      const session = deps.getAutonomousSessions().get(req.params.sessionId);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }
      if (session.status === "completed" || session.status === "stopped") {
        return res
          .status(400)
          .json({ error: "Cannot reject content for a finished session" });
      }

      clearPendingDraft(session);
      if (session.autoIterate) {
        setSessionRunning(session);
      } else {
        setSessionPaused(session);
      }
      deps.persistSessions();
      res.json(session);
    },
  );

  app.post(
    "/api/autonomous/:sessionId/pause",
    (req: Request, res: Response) => {
      deps.trackRequest("/api/autonomous/:sessionId/pause");
      const session = deps.getAutonomousSessions().get(req.params.sessionId);
      if (!session) return res.status(404).json({ error: "Session not found" });
      if (session.status !== "running") {
        return res.status(400).json({
          error: `Cannot pause session with status: ${session.status}`,
        });
      }

      const controller = deps.getSessionControllers().get(session.id);
      if (controller) {
        try {
          controller.abort();
          deps.getSessionControllers().delete(session.id);
          createLogger("autonomous").info(
            "Aborted in-flight generation on pause",
            { sessionId: session.id },
          );
        } catch (error) {
          createLogger("autonomous").warn(
            "Failed to abort controller on pause",
            {
              sessionId: session.id,
              error: String(error),
            },
          );
        }
      }

      setSessionPaused(session);
      createLogger("autonomous").info("Session paused", {
        sessionId: session.id,
      });
      deps.persistSessions();
      res.json(session);
    },
  );

  app.post(
    "/api/autonomous/:sessionId/resume",
    (req: Request, res: Response) => {
      deps.trackRequest("/api/autonomous/:sessionId/resume");
      const session = deps.getAutonomousSessions().get(req.params.sessionId);
      if (!session) return res.status(404).json({ error: "Session not found" });
      if (session.status !== "paused") {
        return res.status(400).json({
          error: `Cannot resume session with status: ${session.status}`,
        });
      }
      if (session.pendingDraft) {
        return res.status(400).json({
          error: "Review or reject the pending draft before resuming",
        });
      }

      session.autoIterate = true;
      setSessionRunning(session);
      createLogger("autonomous").info("Session resumed", {
        sessionId: session.id,
      });
      deps.persistSessions();
      res.json(session);
    },
  );

  app.post("/api/autonomous/:sessionId/stop", (req: Request, res: Response) => {
    deps.trackRequest("/api/autonomous/:sessionId/stop");
    const session = deps.getAutonomousSessions().get(req.params.sessionId);
    if (!session) return res.status(404).json({ error: "Session not found" });

    const controller = deps.getSessionControllers().get(session.id);
    if (controller) {
      try {
        controller.abort();
        deps.getSessionControllers().delete(session.id);
        createLogger("autonomous").info(
          "Aborted in-flight generation on stop",
          { sessionId: session.id },
        );
      } catch (error) {
        createLogger("autonomous").warn("Failed to abort controller on stop", {
          sessionId: session.id,
          error: String(error),
        });
      }
    }

    session.status = "stopped";
    session.autoIterate = false;
    session.completedAt = new Date().toISOString();
    clearPendingDraft(session);
    deps.persistSessions();
    res.json(session);
  });
}
