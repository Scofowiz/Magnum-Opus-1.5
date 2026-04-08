import type {
  AutonomousSession,
  BookProgress,
  Chapter,
  ChapterOutline,
  Character,
  ExtractionMetrics,
  GenerationResult,
  GenerationRecoveryDraft,
  NarrativeState,
  Project,
  ProjectSummary,
  StoryBible,
} from "../types/magnumOpus";
import type { AuthorDossier, ExportConfig } from "../types/authorExport";
import type { AppPreferences } from "../types/preferences";

const API = "";

type JsonBody = unknown;
type PreferencesUpdateInput = Partial<AppPreferences> | Record<string, unknown>;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API}${path}`, init);
  let payload: unknown = null;

  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const error =
      payload && typeof payload === "object" && "error" in payload
        ? String((payload as { error?: unknown }).error)
        : `Request failed with status ${response.status}`;
    const err = new Error(error);
    (err as Error & { payload?: unknown }).payload = payload;
    throw err;
  }

  return payload as T;
}

function jsonRequest<T>(
  path: string,
  method: string,
  body?: JsonBody,
): Promise<T> {
  return request<T>(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export const api = {
  health: {
    get: (): Promise<{ status?: string }> =>
      request<{ status?: string }>("/health"),
  },
  projects: {
    list: (): Promise<ProjectSummary[]> =>
      request<ProjectSummary[]>("/api/projects"),
    create: (input: {
      title: string;
      genre: string;
      description?: string;
    }): Promise<Project> =>
      jsonRequest<Project>("/api/projects", "POST", input),
    get: (projectId: string): Promise<Project> =>
      request<Project>(`/api/projects/${projectId}`),
    update: (projectId: string, updates: Partial<Project>): Promise<Project> =>
      jsonRequest<Project>(`/api/projects/${projectId}`, "PUT", updates),
    remove: (projectId: string): Promise<{ deleted: boolean }> =>
      request<{ deleted: boolean }>(`/api/projects/${projectId}`, {
        method: "DELETE",
      }),
    listChapters: (projectId: string): Promise<Chapter[]> =>
      request<Chapter[]>(`/api/projects/${projectId}/chapters`),
    createChapter: (projectId: string, title?: string): Promise<Chapter> =>
      jsonRequest<Chapter>(`/api/projects/${projectId}/chapters`, "POST", {
        title,
      }),
    updateChapter: (
      projectId: string,
      chapterId: string,
      updates: Partial<Chapter>,
    ): Promise<Chapter> =>
      jsonRequest<Chapter>(
        `/api/projects/${projectId}/chapters/${chapterId}`,
        "PUT",
        updates,
      ),
    deleteChapter: (
      projectId: string,
      chapterId: string,
    ): Promise<{ deleted: boolean }> =>
      request<{ deleted: boolean }>(
        `/api/projects/${projectId}/chapters/${chapterId}`,
        { method: "DELETE" },
      ),
    prepareBookMode: (
      projectId: string,
      input: { targetChapters?: number },
    ): Promise<{ chapters: Chapter[]; created: number }> =>
      jsonRequest<{ chapters: Chapter[]; created: number }>(
        `/api/projects/${projectId}/prepare-book-mode`,
        "POST",
        input,
      ),
    cleanupChapters: (
      projectId: string,
      input: { minWords?: number; keepFirst?: boolean },
    ): Promise<{
      before: number;
      after: number;
      removed: string[];
      remaining: Array<{ title: string; wordCount: number }>;
    }> =>
      jsonRequest<{
        before: number;
        after: number;
        removed: string[];
        remaining: Array<{ title: string; wordCount: number }>;
      }>(`/api/projects/${projectId}/cleanup-chapters`, "POST", input),
    getStoryBible: (projectId: string): Promise<StoryBible | null> =>
      request<StoryBible | null>(`/api/projects/${projectId}/story-bible`),
    updateStoryBible: (
      projectId: string,
      storyBible: StoryBible,
    ): Promise<StoryBible> =>
      jsonRequest<StoryBible>(
        `/api/projects/${projectId}/story-bible`,
        "PUT",
        storyBible,
      ),
    extractStoryBible: (
      projectId: string,
      input: { text?: string },
    ): Promise<StoryBible> =>
      jsonRequest<StoryBible>(
        `/api/projects/${projectId}/story-bible/extract`,
        "POST",
        input,
      ),
    extractStoryBibleIterative: (
      projectId: string,
      input: { text?: string; enrichExisting?: boolean },
    ): Promise<{
      storyBible: StoryBible;
      extractionMetrics: ExtractionMetrics;
    }> =>
      jsonRequest<{
        storyBible: StoryBible;
        extractionMetrics: ExtractionMetrics;
      }>(
        `/api/projects/${projectId}/story-bible/extract-iterative`,
        "POST",
        input,
      ),
    expandSynopsis: (
      projectId: string,
      input: { synopsis: string; targetChapters?: number },
    ): Promise<{
      chapterOutlines: ChapterOutline[];
      storyNotes: string;
      isSuggestion: boolean;
    }> =>
      jsonRequest<{
        chapterOutlines: ChapterOutline[];
        storyNotes: string;
        isSuggestion: boolean;
      }>(`/api/projects/${projectId}/expand-synopsis`, "POST", input),
    createCharacter: (
      projectId: string,
      input: Partial<Character>,
    ): Promise<Character> =>
      jsonRequest<Character>(
        `/api/projects/${projectId}/characters`,
        "POST",
        input,
      ),
    updateCharacter: (
      projectId: string,
      characterId: string,
      input: Partial<Character>,
    ): Promise<Character> =>
      jsonRequest<Character>(
        `/api/projects/${projectId}/characters/${characterId}`,
        "PUT",
        input,
      ),
    deleteCharacter: (
      projectId: string,
      characterId: string,
    ): Promise<{ deleted: boolean }> =>
      request<{ deleted: boolean }>(
        `/api/projects/${projectId}/characters/${characterId}`,
        { method: "DELETE" },
      ),
  },
  chapters: {
    save: (
      chapterId: string,
      input: {
        content: string;
        trigger?: string;
        generationDraftId?: string;
      },
    ): Promise<{ saved: boolean; wordCount: number; trigger: string }> =>
      jsonRequest<{ saved: boolean; wordCount: number; trigger: string }>(
        `/api/chapters/${chapterId}/save`,
        "POST",
        input,
      ),
    history: (chapterId: string, limit = 50): Promise<unknown> =>
      request<unknown>(`/api/chapters/${chapterId}/history?limit=${limit}`),
    restore: (
      chapterId: string,
      versionId: number,
    ): Promise<{ restored: boolean; versionId: number }> =>
      jsonRequest<{ restored: boolean; versionId: number }>(
        `/api/chapters/${chapterId}/restore/${versionId}`,
        "POST",
      ),
  },
  generation: {
    generate: (input: Record<string, unknown>): Promise<GenerationResult> =>
      jsonRequest<GenerationResult>("/api/generate", "POST", input),
    retry: (
      input: Record<string, unknown>,
    ): Promise<{
      text: string;
      wordCount: number;
      qualityIssues?: string[];
      qualityFallback?: boolean;
      recoveryDraftId?: string;
    }> =>
      jsonRequest<{
        text: string;
        wordCount: number;
        qualityIssues?: string[];
        qualityFallback?: boolean;
        recoveryDraftId?: string;
      }>("/api/generate/retry", "POST", input),
    getRecoveryDraft: (
      draftId: string,
    ): Promise<GenerationRecoveryDraft | null> =>
      request<GenerationRecoveryDraft | null>(
        `/api/generate/recovery/${draftId}`,
      ),
    getLatestRecoveryDraft: (
      projectId: string,
      chapterId: string,
    ): Promise<GenerationRecoveryDraft | null> =>
      request<GenerationRecoveryDraft | null>(
        `/api/generate/recovery/latest?projectId=${encodeURIComponent(projectId)}&chapterId=${encodeURIComponent(chapterId)}`,
      ),
    resolveRecoveryDraft: (
      draftId: string,
      status: "persisted" | "dismissed",
    ): Promise<{ resolved: boolean; status: "persisted" | "dismissed" }> =>
      jsonRequest<{ resolved: boolean; status: "persisted" | "dismissed" }>(
        `/api/generate/recovery/${draftId}/resolve`,
        "POST",
        { status },
      ),
    scenePack: (input: Record<string, unknown>): Promise<unknown> =>
      jsonRequest<unknown>("/api/prompt-planner/scene-pack", "POST", input),
    promptHistory: (params?: {
      projectId?: string;
      chapterId?: string;
      limit?: number;
    }): Promise<unknown[]> => {
      const search = new URLSearchParams();
      if (params?.projectId) search.set("projectId", params.projectId);
      if (params?.chapterId) search.set("chapterId", params.chapterId);
      if (params?.limit) search.set("limit", String(params.limit));
      const suffix = search.toString() ? `?${search.toString()}` : "";
      return request<unknown[]>(`/api/prompt-planner/history${suffix}`);
    },
  },
  autonomous: {
    list: (): Promise<Array<Partial<AutonomousSession> & { id: string }>> =>
      request<Array<Partial<AutonomousSession> & { id: string }>>(
        "/api/autonomous",
      ),
    get: (sessionId: string): Promise<AutonomousSession> =>
      request<AutonomousSession>(`/api/autonomous/${sessionId}`),
    start: (input: Record<string, unknown>): Promise<AutonomousSession> =>
      jsonRequest<AutonomousSession>("/api/autonomous/start", "POST", input),
    updateSettings: (
      sessionId: string,
      input: { autoIterate?: boolean; autoAccept?: boolean },
    ): Promise<AutonomousSession> =>
      jsonRequest<AutonomousSession>(
        `/api/autonomous/${sessionId}/settings`,
        "POST",
        input,
      ),
    iteratePreview: (
      sessionId: string,
    ): Promise<{
      session: AutonomousSession;
      newContent: string;
      newWords: number;
      pendingDraft?: string;
      qualityBlocked?: boolean;
      qualityIssues?: string[];
      endOfChapter?: boolean;
      endOfChapterReason?: string;
      chapterContent: string;
      chapterWordCount: number;
      totalProjectWords: number;
      plotPointHit?: string | null;
      narrativeState: NarrativeState;
      chapterComplete: boolean;
      movingToNextChapter: boolean;
      nextChapterTitle: string;
      previewMode: boolean;
      bookProgress: BookProgress | null;
    }> =>
      jsonRequest<{
        session: AutonomousSession;
        newContent: string;
        newWords: number;
        pendingDraft?: string;
        qualityBlocked?: boolean;
        qualityIssues?: string[];
        endOfChapter?: boolean;
        endOfChapterReason?: string;
        chapterContent: string;
        chapterWordCount: number;
        totalProjectWords: number;
        plotPointHit?: string | null;
        narrativeState: NarrativeState;
        chapterComplete: boolean;
        movingToNextChapter: boolean;
        nextChapterTitle: string;
        previewMode: boolean;
        bookProgress: BookProgress | null;
      }>(`/api/autonomous/${sessionId}/iterate?preview=true`, "POST"),
    accept: (
      sessionId: string,
      input: { content: string; wordCount?: number },
    ): Promise<{
      session: AutonomousSession;
      completedChapterId: string;
      chapterContent: string;
      chapterWordCount: number;
      totalProjectWords: number;
      plotPointHit?: string | null;
      chapterComplete: boolean;
      movingToNextChapter: boolean;
      nextChapterTitle: string;
      endOfChapter?: boolean;
      endOfChapterReason?: string;
      chapters: Chapter[];
      bookProgress: BookProgress | null;
    }> =>
      jsonRequest<{
        session: AutonomousSession;
        completedChapterId: string;
        chapterContent: string;
        chapterWordCount: number;
        totalProjectWords: number;
        plotPointHit?: string | null;
        chapterComplete: boolean;
        movingToNextChapter: boolean;
        nextChapterTitle: string;
        endOfChapter?: boolean;
        endOfChapterReason?: string;
        chapters: Chapter[];
        bookProgress: BookProgress | null;
      }>(`/api/autonomous/${sessionId}/accept`, "POST", input),
    reject: (sessionId: string): Promise<AutonomousSession> =>
      jsonRequest<AutonomousSession>(
        `/api/autonomous/${sessionId}/reject`,
        "POST",
      ),
    pause: (sessionId: string): Promise<AutonomousSession> =>
      jsonRequest<AutonomousSession>(
        `/api/autonomous/${sessionId}/pause`,
        "POST",
      ),
    resume: (sessionId: string): Promise<AutonomousSession> =>
      jsonRequest<AutonomousSession>(
        `/api/autonomous/${sessionId}/resume`,
        "POST",
      ),
    stop: (sessionId: string): Promise<AutonomousSession> =>
      jsonRequest<AutonomousSession>(
        `/api/autonomous/${sessionId}/stop`,
        "POST",
      ),
  },
  style: {
    get: (): Promise<{ fingerprint: unknown; sampleCount: number }> =>
      request<{ fingerprint: unknown; sampleCount: number }>("/api/style"),
    uploadSample: (input: { sample: string }): Promise<unknown> =>
      jsonRequest<unknown>("/api/style/samples", "POST", input),
    clear: (): Promise<{ cleared?: boolean }> =>
      request<{ cleared?: boolean }>("/api/style", { method: "DELETE" }),
  },
  provider: {
    get: (): Promise<unknown> => request<unknown>("/api/provider"),
    getCodexStatus: (): Promise<unknown> =>
      request<unknown>("/api/provider/codex/status"),
    getGroqModels: (input?: { apiKey?: string }): Promise<unknown> =>
      input?.apiKey
        ? jsonRequest<unknown>("/api/provider/groq/models", "POST", input)
        : request<unknown>("/api/provider/groq/models"),
    getGoogleModels: (input?: { apiKey?: string }): Promise<unknown> =>
      input?.apiKey
        ? jsonRequest<unknown>("/api/provider/google/models", "POST", input)
        : request<unknown>("/api/provider/google/models"),
    getOllamaModels: (baseUrl?: string): Promise<unknown> =>
      request<unknown>(
        `/api/provider/ollama/models${baseUrl ? `?baseUrl=${encodeURIComponent(baseUrl)}` : ""}`,
      ),
    update: (input: Record<string, unknown>): Promise<unknown> =>
      jsonRequest<unknown>("/api/provider", "PUT", input),
    test: (): Promise<unknown> =>
      jsonRequest<unknown>("/api/provider/test", "POST"),
  },
  preferences: {
    get: (): Promise<AppPreferences> =>
      request<AppPreferences>("/api/preferences"),
    update: (input: PreferencesUpdateInput): Promise<AppPreferences> =>
      jsonRequest<AppPreferences>("/api/preferences", "PUT", input),
  },
  craftPatterns: {
    clear: (): Promise<unknown> =>
      request<unknown>("/api/craft-patterns", { method: "DELETE" }),
  },
  lifetimeMemory: {
    clear: (): Promise<unknown> =>
      request<unknown>("/api/lifetime-memory", { method: "DELETE" }),
  },
  metrics: {
    get: (): Promise<unknown> => request<unknown>("/api/metrics"),
  },
  logs: {
    list: (limit = 80): Promise<unknown> =>
      request<unknown>(`/api/logs?limit=${limit}`),
  },
  authorProfile: {
    get: (): Promise<AuthorDossier | null> =>
      request<AuthorDossier | null>("/api/author-profile"),
    save: (profile: AuthorDossier): Promise<AuthorDossier> =>
      jsonRequest<AuthorDossier>("/api/author-profile", "PUT", profile),
  },
  exportConfigs: {
    list: (): Promise<ExportConfig[]> =>
      request<ExportConfig[]>("/api/export-configs"),
    create: (config: Omit<ExportConfig, "id">): Promise<ExportConfig> =>
      jsonRequest<ExportConfig>("/api/export-configs", "POST", config),
    update: (
      id: string,
      config: Partial<ExportConfig>,
    ): Promise<ExportConfig> =>
      jsonRequest<ExportConfig>(`/api/export-configs/${id}`, "PUT", config),
    delete: (id: string): Promise<{ deleted: boolean }> =>
      request<{ deleted: boolean }>(`/api/export-configs/${id}`, {
        method: "DELETE",
      }),
    setDefault: (id: string): Promise<{ success: boolean }> =>
      jsonRequest<{ success: boolean }>(
        `/api/export-configs/${id}/default`,
        "POST",
      ),
  },
};
