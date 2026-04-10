/**
 * Mock Factory - London School TDD
 *
 * Creates mock objects for dependency injection, enabling
 * outside-in development and behavior verification.
 */

import { vi } from "vitest";

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface MockDatabase {
  saveChapterWithHistory: ReturnType<typeof vi.fn>;
  getChapterHistory: ReturnType<typeof vi.fn>;
  restoreChapterVersion: ReturnType<typeof vi.fn>;
  saveProject: ReturnType<typeof vi.fn>;
  getProject: ReturnType<typeof vi.fn>;
  getAllProjects: ReturnType<typeof vi.fn>;
  deleteProject: ReturnType<typeof vi.fn>;
  saveChapter: ReturnType<typeof vi.fn>;
  getChapter: ReturnType<typeof vi.fn>;
  getChaptersByProject: ReturnType<typeof vi.fn>;
  deleteChapter: ReturnType<typeof vi.fn>;
  checkDatabaseHealth: ReturnType<typeof vi.fn>;
}

export interface MockAIProvider {
  chatCompletion: ReturnType<typeof vi.fn>;
  analyzeStyle: ReturnType<typeof vi.fn>;
  generateContent: ReturnType<typeof vi.fn>;
  scoreQuality: ReturnType<typeof vi.fn>;
}

export interface MockFileSystem {
  readFile: ReturnType<typeof vi.fn>;
  writeFile: ReturnType<typeof vi.fn>;
  exists: ReturnType<typeof vi.fn>;
  mkdir: ReturnType<typeof vi.fn>;
  appendFile: ReturnType<typeof vi.fn>;
}

export interface MockLogger {
  debug: ReturnType<typeof vi.fn>;
  info: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
}

export interface MockMetricsTracker {
  trackTokens: ReturnType<typeof vi.fn>;
  trackQualityScore: ReturnType<typeof vi.fn>;
  trackLatency: ReturnType<typeof vi.fn>;
  trackRequest: ReturnType<typeof vi.fn>;
  trackExtraction: ReturnType<typeof vi.fn>;
}

export interface MockAntiAveraging {
  analyze: ReturnType<typeof vi.fn>;
  generatePromptDirectives: ReturnType<typeof vi.fn>;
}

export interface MockCacheManager {
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  clear: ReturnType<typeof vi.fn>;
  has: ReturnType<typeof vi.fn>;
}

export interface MockSessionManager {
  create: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  saveSnapshot: ReturnType<typeof vi.fn>;
  restoreSnapshot: ReturnType<typeof vi.fn>;
}

// ============================================================================
// MOCK FACTORY FUNCTIONS
// ============================================================================

export function createMockDatabase(
  overrides?: Partial<MockDatabase>,
): MockDatabase {
  return {
    saveChapterWithHistory: vi.fn().mockName("db.saveChapterWithHistory"),
    getChapterHistory: vi
      .fn()
      .mockName("db.getChapterHistory")
      .mockReturnValue([]),
    restoreChapterVersion: vi.fn().mockName("db.restoreChapterVersion"),
    saveProject: vi.fn().mockName("db.saveProject"),
    getProject: vi.fn().mockName("db.getProject").mockReturnValue(null),
    getAllProjects: vi.fn().mockName("db.getAllProjects").mockReturnValue([]),
    deleteProject: vi.fn().mockName("db.deleteProject"),
    saveChapter: vi.fn().mockName("db.saveChapter"),
    getChapter: vi.fn().mockName("db.getChapter").mockReturnValue(null),
    getChaptersByProject: vi
      .fn()
      .mockName("db.getChaptersByProject")
      .mockReturnValue([]),
    deleteChapter: vi.fn().mockName("db.deleteChapter"),
    checkDatabaseHealth: vi
      .fn()
      .mockName("db.checkDatabaseHealth")
      .mockReturnValue({
        ok: true,
        walMode: true,
        syncMode: "FULL",
      }),
    ...overrides,
  };
}

export function createMockAIProvider(
  overrides?: Partial<MockAIProvider>,
): MockAIProvider {
  return {
    chatCompletion: vi.fn().mockName("ai.chatCompletion").mockResolvedValue({
      text: "Generated content",
      tokens: 100,
    }),
    analyzeStyle: vi.fn().mockName("ai.analyzeStyle").mockResolvedValue({
      tone: "narrative",
      complexity: 0.6,
      showVsTell: 0.7,
    }),
    generateContent: vi.fn().mockName("ai.generateContent").mockResolvedValue({
      content: "Generated text",
      qualityScore: 0.8,
    }),
    scoreQuality: vi.fn().mockName("ai.scoreQuality").mockResolvedValue({
      score: 0.85,
      feedback: "Good prose quality",
    }),
    ...overrides,
  };
}

export function createMockFileSystem(
  overrides?: Partial<MockFileSystem>,
): MockFileSystem {
  return {
    readFile: vi.fn().mockName("fs.readFile").mockReturnValue(""),
    writeFile: vi.fn().mockName("fs.writeFile"),
    exists: vi.fn().mockName("fs.exists").mockReturnValue(true),
    mkdir: vi.fn().mockName("fs.mkdir"),
    appendFile: vi.fn().mockName("fs.appendFile"),
    ...overrides,
  };
}

export function createMockLogger(overrides?: Partial<MockLogger>): MockLogger {
  return {
    debug: vi.fn().mockName("logger.debug"),
    info: vi.fn().mockName("logger.info"),
    warn: vi.fn().mockName("logger.warn"),
    error: vi.fn().mockName("logger.error"),
    ...overrides,
  };
}

export function createMockMetricsTracker(
  overrides?: Partial<MockMetricsTracker>,
): MockMetricsTracker {
  return {
    trackTokens: vi.fn().mockName("metrics.trackTokens"),
    trackQualityScore: vi.fn().mockName("metrics.trackQualityScore"),
    trackLatency: vi.fn().mockName("metrics.trackLatency"),
    trackRequest: vi.fn().mockName("metrics.trackRequest"),
    trackExtraction: vi.fn().mockName("metrics.trackExtraction"),
    ...overrides,
  };
}

export function createMockAntiAveraging(
  overrides?: Partial<MockAntiAveraging>,
): MockAntiAveraging {
  return {
    analyze: vi
      .fn()
      .mockName("antiAveraging.analyze")
      .mockReturnValue({
        score: 0.3,
        passed: true,
        violations: [],
        suggestions: [],
        metrics: {
          genericPhraseCount: 0,
          predictableStructure: false,
          voiceMatchScore: 0.7,
          emotionalFlatness: 0.4,
          dialogueTagViolations: [],
        },
      }),
    generatePromptDirectives: vi
      .fn()
      .mockName("antiAveraging.generatePromptDirectives")
      .mockReturnValue(""),
    ...overrides,
  };
}

export function createMockCacheManager(
  overrides?: Partial<MockCacheManager>,
): MockCacheManager {
  return {
    get: vi.fn().mockName("cache.get").mockReturnValue(undefined),
    set: vi.fn().mockName("cache.set"),
    delete: vi.fn().mockName("cache.delete"),
    clear: vi.fn().mockName("cache.clear"),
    has: vi.fn().mockName("cache.has").mockReturnValue(false),
    ...overrides,
  };
}

export function createMockSessionManager(
  overrides?: Partial<MockSessionManager>,
): MockSessionManager {
  return {
    create: vi
      .fn()
      .mockName("session.create")
      .mockReturnValue({ id: "session-123" }),
    get: vi.fn().mockName("session.get").mockReturnValue(null),
    update: vi.fn().mockName("session.update"),
    delete: vi.fn().mockName("session.delete"),
    saveSnapshot: vi.fn().mockName("session.saveSnapshot"),
    restoreSnapshot: vi
      .fn()
      .mockName("session.restoreSnapshot")
      .mockReturnValue(null),
    ...overrides,
  };
}

// ============================================================================
// COMPOSITE MOCK FACTORIES
// ============================================================================

export interface ServerDependencies {
  db: MockDatabase;
  ai: MockAIProvider;
  fs: MockFileSystem;
  logger: MockLogger;
  metrics: MockMetricsTracker;
  antiAveraging: MockAntiAveraging;
  cache: MockCacheManager;
  session: MockSessionManager;
}

type MockPayload = Record<string, unknown>;

export function createServerDependencies(): ServerDependencies {
  return {
    db: createMockDatabase(),
    ai: createMockAIProvider(),
    fs: createMockFileSystem(),
    logger: createMockLogger(),
    metrics: createMockMetricsTracker(),
    antiAveraging: createMockAntiAveraging(),
    cache: createMockCacheManager(),
    session: createMockSessionManager(),
  };
}

// ============================================================================
// MOCK RESPONSE BUILDERS
// ============================================================================

export const mockResponses = {
  project: (overrides = {}): MockPayload => ({
    id: "project-123",
    title: "Test Project",
    description: "A test project",
    genre: "Fiction",
    content: "",
    wordCount: 0,
    chapters: [],
    storyBible: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }),

  chapter: (overrides = {}): MockPayload => ({
    id: "chapter-123",
    title: "Chapter 1",
    content: "Chapter content here",
    wordCount: 3,
    order: 0,
    ...overrides,
  }),

  storyBible: (overrides = {}): MockPayload => ({
    premise: {
      logline: "A hero goes on a journey",
      synopsis: "Extended synopsis",
      themes: ["Adventure", "Growth"],
      tone: "Epic",
      genre: "Fantasy",
    },
    characters: [],
    world: {
      setting: "Medieval fantasy",
      timePeriod: "Ancient",
      locations: [],
      rules: [],
    },
    plotStructure: {
      acts: [],
      plotThreads: [],
    },
    chapterOutlines: [],
    styleDirectives: {
      pov: "Third person limited",
      tense: "Past",
      proseStyle: "Literary",
      dialogueStyle: "Natural",
    },
    ...overrides,
  }),

  styleFingerprint: (overrides = {}): MockPayload => ({
    avgSentenceLength: 15,
    dialogueRatio: 0.3,
    passiveVoiceRatio: 0.1,
    adverbDensity: 0.02,
    vocabularyComplexity: 0.5,
    toneDescriptor: "narrative",
    showVsTellRatio: 0.7,
    metaphorFrequency: 0.05,
    strengths: ["dialogue", "pacing"],
    improvements: ["description"],
    signaturePhrases: [],
    dialogueTags: { preferred: ["said"], avoided: ["exclaimed"] },
    verbChoices: { movement: [], speech: [], emotion: [] },
    sentencePatterns: [],
    sceneOpenings: [],
    tensionTechniques: [],
    humorStyle: "dry",
    emotionalPalette: ["melancholy", "hope"],
    exemplars: [],
    avoidances: [],
    sampleCount: 3,
    ...overrides,
  }),

  autonomousSession: (overrides = {}): MockPayload => ({
    id: "session-123",
    projectId: "project-123",
    chapterId: "chapter-123",
    status: "running",
    targetWords: 5000,
    wordsGenerated: 0,
    iterations: 0,
    plotPoints: [],
    plotPointsHit: [],
    startedAt: new Date().toISOString(),
    ...overrides,
  }),

  generationResult: (overrides = {}): MockPayload => ({
    content: "Generated prose content",
    tokens: 150,
    qualityScore: 0.82,
    continuityIssues: [],
    ...overrides,
  }),

  averagenessReport: (overrides = {}): MockPayload => ({
    score: 0.25,
    passed: true,
    violations: [],
    suggestions: [],
    metrics: {
      genericPhraseCount: 0,
      predictableStructure: false,
      voiceMatchScore: 0.75,
      emotionalFlatness: 0.3,
      dialogueTagViolations: [],
    },
    ...overrides,
  }),
};

// ============================================================================
// EXPECTATION HELPERS
// ============================================================================

export function expectMockCalledWith<T>(
  mock: ReturnType<typeof vi.fn>,
  expectedArgs: T,
): void {
  expect(mock).toHaveBeenCalledWith(expect.objectContaining(expectedArgs));
}

export function expectMockCalledInOrder(
  first: ReturnType<typeof vi.fn>,
  second: ReturnType<typeof vi.fn>,
): void {
  const firstOrder = first.mock.invocationCallOrder[0] || Infinity;
  const secondOrder = second.mock.invocationCallOrder[0] || Infinity;
  expect(firstOrder).toBeLessThan(secondOrder);
}

export function getAllMockCalls(
  deps: ServerDependencies,
): Array<{ mock: string; args: unknown[]; order: number }> {
  const calls: { mock: string; args: unknown[]; order: number }[] = [];

  const addCalls = (mock: ReturnType<typeof vi.fn>, name: string): void => {
    mock.mock.calls.forEach((args, idx) => {
      calls.push({
        mock: name,
        args,
        order: mock.mock.invocationCallOrder[idx],
      });
    });
  };

  // Collect all calls from all mocks
  Object.entries(deps.db).forEach(([key, mock]) => addCalls(mock, `db.${key}`));
  Object.entries(deps.ai).forEach(([key, mock]) => addCalls(mock, `ai.${key}`));
  Object.entries(deps.logger).forEach(([key, mock]) =>
    addCalls(mock, `logger.${key}`),
  );
  Object.entries(deps.metrics).forEach(([key, mock]) =>
    addCalls(mock, `metrics.${key}`),
  );

  return calls.sort((a, b) => a.order - b.order);
}
