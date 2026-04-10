import type {
  Chapter,
  Character,
  LifetimeMemory,
  Project,
  StoryBible,
  StyleFingerprint,
  UserPreferences,
} from "@server/src/domain/types";
import { createDefaultStoryBible } from "@server/src/services/projects/projectState";

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends Array<infer U>
    ? U[]
    : T[K] extends object
      ? DeepPartial<T[K]>
      : T[K];
};

export function makeChapter(overrides: Partial<Chapter> = {}): Chapter {
  return {
    id: "chapter-1",
    title: "Chapter 1",
    content: "Opening scene content",
    wordCount: 3,
    order: 0,
    ...overrides,
  };
}

export function makeCharacter(
  overrides: DeepPartial<Character> = {},
): Character {
  const base: Character = {
    id: "character-1",
    name: "Mara Voss",
    nicknames: [],
    role: "supporting",
    description: "A driven archivist with a dangerous memory.",
    backstory: "",
    motivation: "",
    fears: [],
    flaw: "",
    arc: "",
    voice: {
      vocabulary: "moderate",
      speechPatterns: [],
      catchphrases: [],
    },
    relationships: [],
  };

  return {
    ...base,
    ...overrides,
    nicknames: overrides.nicknames ?? base.nicknames,
    fears: overrides.fears ?? base.fears,
    relationships: overrides.relationships ?? base.relationships,
    voice: {
      ...base.voice,
      ...(overrides.voice || {}),
      speechPatterns:
        overrides.voice?.speechPatterns ?? base.voice.speechPatterns,
      catchphrases: overrides.voice?.catchphrases ?? base.voice.catchphrases,
    },
  };
}

export function makeStoryBible(
  overrides: DeepPartial<StoryBible> = {},
): StoryBible {
  const base = createDefaultStoryBible();
  return {
    ...base,
    ...overrides,
    premise: {
      ...base.premise,
      ...(overrides.premise || {}),
    },
    characters: overrides.characters ?? base.characters,
    world: {
      ...base.world,
      ...(overrides.world || {}),
      locations: overrides.world?.locations ?? base.world.locations,
      rules: overrides.world?.rules ?? base.world.rules,
    },
    plotStructure: {
      ...base.plotStructure,
      ...(overrides.plotStructure || {}),
      acts: overrides.plotStructure?.acts ?? base.plotStructure.acts,
      plotThreads:
        overrides.plotStructure?.plotThreads ?? base.plotStructure.plotThreads,
    },
    chapterOutlines: overrides.chapterOutlines ?? base.chapterOutlines,
    styleDirectives: {
      ...base.styleDirectives,
      ...(overrides.styleDirectives || {}),
    },
  };
}

export function makeProject(overrides: DeepPartial<Project> = {}): Project {
  const chapters = overrides.chapters ?? [makeChapter()];
  return {
    id: "project-1",
    title: "Vault Run",
    description: "A thriller",
    genre: "Thriller",
    content: chapters.map((chapter) => chapter.content).join("\n\n"),
    wordCount: chapters.reduce((sum, chapter) => sum + chapter.wordCount, 0),
    chapters,
    storyBible: overrides.storyBible ?? makeStoryBible(),
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
    ...overrides,
  };
}

export function makeLifetimeMemory(
  overrides: DeepPartial<LifetimeMemory> = {},
): LifetimeMemory {
  return {
    insights: overrides.insights ?? [],
    writingHistory: overrides.writingHistory ?? [],
    feedbackHistory: overrides.feedbackHistory ?? [],
    projectMemories: overrides.projectMemories ?? [],
  };
}

export function makeStyleFingerprint(
  overrides: DeepPartial<StyleFingerprint> = {},
): StyleFingerprint {
  return {
    vocabularyComplexity: 0.5,
    avgSentenceLength: 14,
    dialogueRatio: 0.3,
    showVsTellRatio: 0.7,
    passiveVoiceRatio: 0.1,
    adverbDensity: 0.1,
    metaphorFrequency: 0.2,
    pacingScore: 0.6,
    toneDescriptor: "tense",
    strengthAreas: [],
    improvementAreas: [],
    sampleCount: 4,
    rawSamples: [],
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
    pacing: "moderate",
    ...overrides,
  };
}

export function makeUserPreferences(
  overrides: DeepPartial<UserPreferences> = {},
): UserPreferences {
  const base: UserPreferences = {
    styleFingerprint: null,
    generationSettings: {
      defaultTemperature: 0.8,
      defaultTopP: 1,
      defaultFrequencyPenalty: 0,
      defaultPresencePenalty: 0,
      defaultTargetWords: 1200,
      enablePromptPlanner: true,
      promptPlannerEmbeddingProvider: "main",
      promptPlannerEmbeddingModel: "",
      promptPlannerProvider: "main",
      promptPlannerModel: "",
      storyBibleProvider: "main",
      storyBibleModel: "",
      promptPlannerTopK: 5,
      promptPlannerFallbackMode: "lexical",
    },
    memorySettings: {
      preferredPov: "third-limited",
      preferredTense: "past",
      contextWindowSize: 6000,
      enableContinuityChecks: true,
      persistentDirections: "",
    },
    qualitySettings: {
      showScores: true,
      minThreshold: 0.7,
    },
    uiPreferences: {
      theme: "light",
      fontSize: 16,
      showWordCount: true,
    },
  };

  return {
    ...base,
    ...overrides,
    generationSettings: {
      ...base.generationSettings,
      ...(overrides.generationSettings || {}),
    },
    memorySettings: {
      ...base.memorySettings,
      ...(overrides.memorySettings || {}),
    },
    qualitySettings: {
      ...base.qualitySettings,
      ...(overrides.qualitySettings || {}),
    },
    uiPreferences: {
      ...base.uiPreferences,
      ...(overrides.uiPreferences || {}),
    },
  };
}
