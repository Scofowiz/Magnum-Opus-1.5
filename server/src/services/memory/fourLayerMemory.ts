import crypto from "node:crypto";
import type {
  CraftPattern,
  LifetimeMemory,
  Project,
  ProjectMemory,
  ProjectMemoryEvent,
  ProjectMemoryPreference,
  ScenePromptPlanRecord,
  StyleFingerprint,
  UserPreferences,
} from "../../domain/types.js";
import { resolveChapterOutlineForChapter } from "../projects/chapterOutline.js";

const FEEDBACK_INSIGHT_RULES = [
  {
    key: "avoid-purple-prose",
    type: "avoidance",
    label: "Keep prose grounded; avoid purple flourishes.",
    matches: (text: string): boolean => text.includes("purple"),
  },
  {
    key: "tighten-paragraphs",
    type: "craft",
    label: "Keep paragraphs tighter and avoid over-explaining.",
    matches: (text: string): boolean =>
      text.includes("too long") ||
      text.includes("wordy") ||
      text.includes("drag"),
  },
  {
    key: "show-dont-tell",
    type: "craft",
    label: "Favor dramatized action over summary or telling.",
    matches: (text: string): boolean =>
      text.includes("telling") ||
      text.includes("summary") ||
      text.includes("exposition"),
  },
  {
    key: "trim-dialogue-tags",
    type: "craft",
    label: "Minimize dialogue tags and let action beats carry attribution.",
    matches: (text: string): boolean =>
      text.includes("dialogue") && text.includes("tag"),
  },
  {
    key: "reduce-adverbs",
    type: "craft",
    label: "Prefer stronger verbs over stacked adverbs.",
    matches: (text: string): boolean => text.includes("adverb"),
  },
  {
    key: "use-active-voice",
    type: "craft",
    label: "Prefer active voice in moments of tension and motion.",
    matches: (text: string): boolean => text.includes("passive"),
  },
  {
    key: "avoid-repetition",
    type: "avoidance",
    label: "Vary sentence structure and repeated word choices.",
    matches: (text: string): boolean => text.includes("repetit"),
  },
  {
    key: "clarify-blocking",
    type: "preference",
    label:
      "Keep action blocking and spatial movement explicit when scenes get dense.",
    matches: (text: string): boolean =>
      text.includes("confus") ||
      text.includes("unclear") ||
      text.includes("blocking"),
  },
] as const;

const MIN_MEMORY_WORDS = 80;
const MAX_PROJECT_EVENTS = 18;
const MAX_PROJECT_PREFERENCES = 12;

interface FourLayerMemorySummary {
  craft: {
    count: number;
    topPatterns: string[];
  };
  lifetime: {
    count: number;
    totalGenerations: number;
    totalFeedback: number;
    totalProjectsWithMemory: number;
    topInsights: string[];
  };
  preference: {
    preferredPov: string;
    preferredTense: string;
    contextWindowSize: number;
    enableContinuityChecks: boolean;
    showQualityScores: boolean;
    minQualityThreshold: number;
    persistentDirectionsCount: number;
  };
  context: {
    plannerEnabled: boolean;
    plannerHistoryCount: number;
    plannerEvidenceDepth: number;
    styleSampleCount: number;
    projectMemoryCount: number;
    projectEventCount: number;
  };
}

export interface RelevantProjectMemory {
  authorDirections: string[];
  projectPreferences: string[];
  projectEvents: string[];
}

function stripHtml(text: string): string {
  return text
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
}

function normalizeText(text: string): string {
  return stripHtml(text).replace(/\s+/g, " ").trim();
}

function clip(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars - 1).trim()}...`;
}

function tokenize(text: string): string[] {
  return normalizeText(text)
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter((token) => token.length > 2);
}

function lexicalOverlap(a: string, b: string): number {
  const aTokens = new Set(tokenize(a));
  const bTokens = new Set(tokenize(b));
  if (aTokens.size === 0 || bTokens.size === 0) return 0;
  let overlap = 0;
  for (const token of aTokens) {
    if (bTokens.has(token)) overlap += 1;
  }
  return overlap / Math.max(aTokens.size, bTokens.size);
}

function splitIntoSentences(text: string): string[] {
  const normalized = normalizeText(text);
  if (!normalized) return [];
  const matches = normalized.match(/[^.!?]+[.!?]+["')\]]*/g);
  if (matches && matches.length > 0) {
    return matches.map((sentence) => sentence.trim()).filter(Boolean);
  }
  return [normalized];
}

function summarizePassage(text: string, sentenceCount = 2): string {
  const sentences = splitIntoSentences(text);
  if (sentences.length === 0) return "";
  return clip(sentences.slice(0, sentenceCount).join(" "), 320);
}

function splitPersistentDirections(text: string | undefined): string[] {
  if (!text) return [];
  return text
    .split(/\n+/)
    .map((line) => line.replace(/^[-*]\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 8)
    .map((line) => clip(line, 240));
}

function averageWordsPerSession(memory: LifetimeMemory): number {
  const substantiveSessions = memory.writingHistory.filter(
    (entry) => entry.wordsWritten >= 400,
  );
  if (substantiveSessions.length === 0) return 0;
  const recentSessions = substantiveSessions.slice(-12);
  const totalWords = recentSessions.reduce(
    (sum, entry) => sum + entry.wordsWritten,
    0,
  );
  return Math.round(totalWords / recentSessions.length);
}

function getOrCreateProjectMemory(
  memory: LifetimeMemory,
  projectId: string,
): ProjectMemory {
  let projectMemory = memory.projectMemories.find(
    (entry) => entry.projectId === projectId,
  );
  if (projectMemory) return projectMemory;

  projectMemory = {
    projectId,
    updatedAt: new Date().toISOString(),
    events: [],
    preferences: [],
  };
  memory.projectMemories.push(projectMemory);
  return projectMemory;
}

function inferChapterTitle(project: Project, chapterId?: string): string {
  if (!chapterId) return "";
  const chapter = project.chapters.find((entry) => entry.id === chapterId);
  return chapter?.title || "";
}

function inferChapterOutline(
  project: Project,
  chapterId?: string,
): NonNullable<Project["storyBible"]>["chapterOutlines"][number] | null {
  if (!project.storyBible?.chapterOutlines?.length || !chapterId) return null;
  const chapter = project.chapters.find((entry) => entry.id === chapterId);
  return (
    resolveChapterOutlineForChapter(
      chapter,
      project.storyBible.chapterOutlines,
    ) || null
  );
}

function normalizePreferenceDirective(text: string): string {
  return clip(normalizeText(text), 220);
}

function makeStableId(prefix: string, seed: string): string {
  return `${prefix}_${crypto.createHash("sha1").update(seed).digest("hex").slice(0, 12)}`;
}

export function hydrateLifetimeMemory(
  input: Partial<LifetimeMemory> | null | undefined,
): LifetimeMemory {
  return {
    insights: Array.isArray(input?.insights) ? input.insights : [],
    writingHistory: Array.isArray(input?.writingHistory)
      ? input.writingHistory
      : [],
    feedbackHistory: Array.isArray(input?.feedbackHistory)
      ? input.feedbackHistory
      : [],
    projectMemories: Array.isArray(input?.projectMemories)
      ? input.projectMemories.map((entry) => ({
          projectId: entry.projectId,
          updatedAt: entry.updatedAt || new Date().toISOString(),
          events: Array.isArray(entry.events) ? entry.events : [],
          preferences: Array.isArray(entry.preferences)
            ? entry.preferences
            : [],
        }))
      : [],
  };
}

export function deriveLifetimeInsights(
  memory: LifetimeMemory,
): LifetimeMemory["insights"] {
  const now = new Date().toISOString();
  const counts = new Map<
    string,
    { type: string; label: string; count: number }
  >();

  for (const entry of memory.feedbackHistory) {
    const haystack =
      `${entry.feedback || ""} ${entry.reason || ""}`.toLowerCase();
    for (const rule of FEEDBACK_INSIGHT_RULES) {
      if (!rule.matches(haystack)) continue;
      const current = counts.get(rule.key) || {
        type: rule.type,
        label: rule.label,
        count: 0,
      };
      current.count += 1;
      counts.set(rule.key, current);
    }
  }

  const preferenceCounts = new Map<string, { label: string; count: number }>();
  for (const projectMemory of memory.projectMemories) {
    for (const preference of projectMemory.preferences) {
      const key = normalizePreferenceDirective(
        preference.content,
      ).toLowerCase();
      if (!key) continue;
      const current = preferenceCounts.get(key) || {
        label: preference.content,
        count: 0,
      };
      current.count += Math.max(1, Math.round(preference.strength * 2));
      preferenceCounts.set(key, current);
    }
  }

  const insights = Array.from(counts.entries())
    .sort((left, right) => right[1].count - left[1].count)
    .slice(0, 6)
    .map(([key, entry]) => ({
      id: key,
      type: entry.type,
      content: entry.label,
      strength: Math.min(1, 0.45 + entry.count * 0.18),
      createdAt: now,
    }));

  for (const [key, entry] of Array.from(preferenceCounts.entries())
    .sort((left, right) => right[1].count - left[1].count)
    .slice(0, 2)) {
    insights.push({
      id: `project-pref-${makeStableId("pref", key)}`,
      type: "project-preference",
      content: entry.label,
      strength: Math.min(1, 0.35 + entry.count * 0.12),
      createdAt: now,
    });
  }

  const avgWords = averageWordsPerSession(memory);
  if (avgWords > 0) {
    insights.push({
      id: "session-cadence",
      type: "habit",
      content: `Recent substantive generations commonly land around ${avgWords} words.`,
      strength: 0.4,
      createdAt: now,
    });
  }

  return insights
    .sort((left, right) => right.strength - left.strength)
    .slice(0, 8);
}

export function recordProjectMemoryFromChapterSave(input: {
  memory: LifetimeMemory;
  project: Project;
  chapterId: string;
  content: string;
  trigger: string;
}): void {
  const plainText = normalizeText(input.content);
  const wordCount = plainText.split(/\s+/).filter(Boolean).length;
  if (wordCount < MIN_MEMORY_WORDS) return;

  const projectMemory = getOrCreateProjectMemory(
    input.memory,
    input.project.id,
  );
  const outline = inferChapterOutline(input.project, input.chapterId);
  const chapterTitle =
    inferChapterTitle(input.project, input.chapterId) || outline?.title || "";
  const contentSummary = summarizePassage(plainText, 2);
  const chapterSummary = outline?.summary
    ? summarizePassage(outline.summary, 1)
    : "";
  const summaryParts = [chapterSummary, contentSummary].filter(Boolean);
  const summary = clip(
    summaryParts.length > 1
      ? `${summaryParts[0]} Latest accepted movement: ${summaryParts[1]}`
      : summaryParts[0] || contentSummary,
    360,
  );
  if (!summary) return;

  const eventId = makeStableId(
    "evt",
    `${input.project.id}:${input.chapterId}:${summary.toLowerCase()}`,
  );
  const existing = projectMemory.events.find((event) => event.id === eventId);
  if (existing) {
    existing.timestamp = new Date().toISOString();
    existing.weight = Math.min(existing.weight + 0.1, 1);
    existing.location =
      outline?.location ||
      existing.location ||
      input.project.storyBible?.world.setting ||
      "";
    existing.characters =
      outline?.characters?.slice(0, 8) || existing.characters;
  } else {
    const event: ProjectMemoryEvent = {
      id: eventId,
      chapterId: input.chapterId,
      chapterTitle,
      summary,
      characters: outline?.characters?.slice(0, 8) || [],
      location:
        outline?.location || input.project.storyBible?.world.setting || "",
      source: input.trigger,
      timestamp: new Date().toISOString(),
      weight: input.trigger === "accepted_generation" ? 0.95 : 0.75,
    };
    projectMemory.events.unshift(event);
    if (projectMemory.events.length > MAX_PROJECT_EVENTS) {
      projectMemory.events = projectMemory.events.slice(0, MAX_PROJECT_EVENTS);
    }
  }

  projectMemory.updatedAt = new Date().toISOString();
}

export function recordProjectPreference(input: {
  memory: LifetimeMemory;
  projectId: string;
  content: string;
  source: string;
  strength?: number;
}): void {
  const normalized = normalizePreferenceDirective(input.content);
  if (!normalized || normalized.toLowerCase() === "try a different approach") {
    return;
  }

  const projectMemory = getOrCreateProjectMemory(input.memory, input.projectId);
  const id = makeStableId(
    "pref",
    `${input.projectId}:${normalized.toLowerCase()}`,
  );
  const existing = projectMemory.preferences.find((entry) => entry.id === id);
  if (existing) {
    existing.updatedAt = new Date().toISOString();
    existing.strength = Math.min(existing.strength + 0.12, 1);
    existing.source = input.source || existing.source;
  } else {
    const preference: ProjectMemoryPreference = {
      id,
      content: normalized,
      strength: Math.max(0.35, Math.min(input.strength ?? 0.72, 1)),
      source: input.source,
      updatedAt: new Date().toISOString(),
    };
    projectMemory.preferences.unshift(preference);
    if (projectMemory.preferences.length > MAX_PROJECT_PREFERENCES) {
      projectMemory.preferences = projectMemory.preferences.slice(
        0,
        MAX_PROJECT_PREFERENCES,
      );
    }
  }

  projectMemory.updatedAt = new Date().toISOString();
}

function formatEventForPrompt(event: ProjectMemoryEvent): string {
  const chapterPrefix = event.chapterTitle ? `${event.chapterTitle}: ` : "";
  const locationSuffix = event.location
    ? ` Location anchor: ${event.location}.`
    : "";
  return clip(`${chapterPrefix}${event.summary}${locationSuffix}`, 260);
}

export function selectRelevantProjectMemory(input: {
  memory: LifetimeMemory;
  project: Project;
  chapterId?: string;
  focusText: string;
  persistentDirections?: string;
}): RelevantProjectMemory {
  const projectMemory = input.memory.projectMemories.find(
    (entry) => entry.projectId === input.project.id,
  );
  const outline = inferChapterOutline(input.project, input.chapterId);
  const focus = [
    input.focusText,
    outline?.title || "",
    outline?.summary || "",
    outline?.beats?.join(" ") || "",
  ]
    .filter(Boolean)
    .join("\n");

  const authorDirections = splitPersistentDirections(
    input.persistentDirections,
  );
  if (!projectMemory) {
    return {
      authorDirections,
      projectPreferences: [],
      projectEvents: [],
    };
  }

  const projectPreferences = projectMemory.preferences
    .slice()
    .sort((left, right) => {
      const leftScore =
        left.strength * 4 + lexicalOverlap(focus, left.content) * 8;
      const rightScore =
        right.strength * 4 + lexicalOverlap(focus, right.content) * 8;
      return rightScore - leftScore;
    })
    .slice(0, 4)
    .map((entry) => entry.content);

  const projectEvents = projectMemory.events
    .slice()
    .sort((left, right) => {
      const leftScore =
        left.weight * 4 +
        lexicalOverlap(focus, `${left.chapterTitle || ""} ${left.summary}`) * 8;
      const rightScore =
        right.weight * 4 +
        lexicalOverlap(focus, `${right.chapterTitle || ""} ${right.summary}`) *
          8;
      return rightScore - leftScore;
    })
    .slice(0, 4)
    .map(formatEventForPrompt);

  return {
    authorDirections,
    projectPreferences,
    projectEvents,
  };
}

export function buildFourLayerMemorySummary(input: {
  craftPatterns: CraftPattern[];
  lifetimeMemory: LifetimeMemory;
  scenePromptPlans: ScenePromptPlanRecord[];
  styleFingerprint: StyleFingerprint | null;
  userPreferences: UserPreferences;
}): FourLayerMemorySummary {
  const lifetimeInsights =
    input.lifetimeMemory.insights.length > 0
      ? input.lifetimeMemory.insights
      : deriveLifetimeInsights(input.lifetimeMemory);
  const persistentDirections = splitPersistentDirections(
    input.userPreferences.memorySettings.persistentDirections,
  );
  const totalProjectEvents = input.lifetimeMemory.projectMemories.reduce(
    (sum, entry) => sum + entry.events.length,
    0,
  );

  return {
    craft: {
      count: input.craftPatterns.length,
      topPatterns: input.craftPatterns
        .slice()
        .sort((left, right) => right.effectiveness - left.effectiveness)
        .slice(0, 3)
        .map((pattern) => pattern.pattern),
    },
    lifetime: {
      count: lifetimeInsights.length,
      totalGenerations: input.lifetimeMemory.writingHistory.length,
      totalFeedback: input.lifetimeMemory.feedbackHistory.length,
      totalProjectsWithMemory: input.lifetimeMemory.projectMemories.length,
      topInsights: lifetimeInsights
        .slice(0, 3)
        .map((insight) => insight.content),
    },
    preference: {
      preferredPov: input.userPreferences.memorySettings.preferredPov,
      preferredTense: input.userPreferences.memorySettings.preferredTense,
      contextWindowSize: input.userPreferences.memorySettings.contextWindowSize,
      enableContinuityChecks:
        input.userPreferences.memorySettings.enableContinuityChecks,
      showQualityScores: input.userPreferences.qualitySettings.showScores,
      minQualityThreshold: input.userPreferences.qualitySettings.minThreshold,
      persistentDirectionsCount: persistentDirections.length,
    },
    context: {
      plannerEnabled:
        input.userPreferences.generationSettings.enablePromptPlanner,
      plannerHistoryCount: input.scenePromptPlans.length,
      plannerEvidenceDepth:
        input.userPreferences.generationSettings.promptPlannerTopK,
      styleSampleCount: input.styleFingerprint?.sampleCount || 0,
      projectMemoryCount: input.lifetimeMemory.projectMemories.length,
      projectEventCount: totalProjectEvents,
    },
  };
}
