import {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
  lazy,
  Suspense,
  type JSX,
} from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { api } from "../api/client";
import { resolveChapterOutline } from "../lib/chapterOutline";
import type {
  Chapter,
  ChapterOutline,
  GenerationResult,
  Project,
} from "../types/magnumOpus";
import { playUiSound } from "../utils/uiSound";

const API = "";

const LOCAL_DRAFT_PREFIX = "magnum-opus:local-draft";
const GENERATION_RECOVERY_PREFIX = "magnum-opus:generation-recovery";
const STEERING_PROMPT_PREFIX = "magnum-opus:steering-prompt";
const LOCAL_DRAFT_FLUSH_MS = 600;
const IDLE_SAVE_MS = 1500;
const ExportDialog = lazy(() =>
  import("./ExportDialog").then((module) => ({ default: module.ExportDialog })),
);

interface EditorProps {
  project: Project;
  chapter: Chapter | null;
  chapters: Chapter[];
  onChapterChange: (chapter: Chapter) => void;
  onChapterUpdate: (
    chapterId: string,
    updates: Partial<Chapter>,
  ) => Promise<void>;
  onChapterLocalUpdate: (chapterId: string, updates: Partial<Chapter>) => void;
  onAddChapter: () => void;
  onDeleteChapter: (chapterId: string) => void;
  onProjectUpdate: (updates: Partial<Project>) => void;
}

interface CursorContextSnapshot {
  before: string;
  after: string;
  selectionFrom: number;
  selectionTo: number;
  selectedText: string;
}

interface GenerationAnchor {
  chapterId: string | null;
  from: number;
  to: number;
}

interface StoredGenerationRecovery {
  draftId: string | null;
  projectId: string;
  chapterId: string;
  text: string;
  prompt: string;
  autoAcceptRequested: boolean;
  anchor: GenerationAnchor | null;
  savedAt: string;
}

function safeLocalStorageGet(key: string | null): string | null {
  if (!key || typeof window === "undefined") return null;

  try {
    return window.localStorage.getItem(key);
  } catch (storageError) {
    console.error("Failed to read localStorage entry:", storageError);
    return null;
  }
}

function safeLocalStorageSet(key: string | null, value: string): boolean {
  if (!key || typeof window === "undefined") return false;

  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch (storageError) {
    console.error("Failed to write localStorage entry:", storageError);
    return false;
  }
}

function safeLocalStorageRemove(key: string | null): void {
  if (!key || typeof window === "undefined") return;

  try {
    window.localStorage.removeItem(key);
  } catch (storageError) {
    console.error("Failed to remove localStorage entry:", storageError);
  }
}

export function Editor({
  project,
  chapter,
  chapters,
  onChapterChange,
  onChapterUpdate,
  onChapterLocalUpdate,
  onAddChapter,
  onDeleteChapter,
}: EditorProps): JSX.Element {
  const [isGenerating, setIsGenerating] = useState(false);
  const [lastGeneration, setLastGeneration] = useState<GenerationResult | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [plannerFallbackNotice, setPlannerFallbackNotice] = useState<{
    message: string;
    canFallback: boolean;
  } | null>(null);
  const [prompt, setPrompt] = useState("");
  const [nonfictionMode, setNonfictionMode] = useState(false);
  const [targetWords, setTargetWords] = useState(500);
  const [showChapterList, setShowChapterList] = useState(true);
  const [autoSaveStatus, setAutoSaveStatus] = useState<
    "saved" | "saving" | "unsaved"
  >("saved");
  const [pendingContent, setPendingContent] = useState<string | null>(null);
  const [autoAccept, setAutoAccept] = useState(false);
  const [targetWordsDisplay, setTargetWordsDisplay] = useState(500);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [beatsExpanded, setBeatsExpanded] = useState(false);
  const [recoveryNotice, setRecoveryNotice] = useState<string | null>(null);
  const [generationRecoveryNotice, setGenerationRecoveryNotice] = useState<
    string | null
  >(null);
  const [localBackupReady, setLocalBackupReady] = useState(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout>();
  const localDraftTimeoutRef = useRef<NodeJS.Timeout>();
  const sliderDebounceRef = useRef<NodeJS.Timeout>();
  const lastEditorContentRef = useRef<string>(chapter?.content || "");
  const lastSavedContentRef = useRef<string>(chapter?.content || "");
  const lastSaveRef = useRef<number>(0);
  const suppressEditorUpdateRef = useRef(false);
  const pendingGenerationAnchorRef = useRef<GenerationAnchor | null>(null);
  const lastGenerationAnchorRef = useRef<GenerationAnchor | null>(null);
  const pendingGenerationDraftIdRef = useRef<string | null>(null);
  const capturedGenerateContextRef = useRef<CursorContextSnapshot | null>(null);
  const isMountedRef = useRef(true);
  const draftKey = useMemo(
    () =>
      chapter ? `${LOCAL_DRAFT_PREFIX}:${project.id}:${chapter.id}` : null,
    [project.id, chapter?.id],
  );
  const steeringPromptKey = useMemo(
    () =>
      chapter ? `${STEERING_PROMPT_PREFIX}:${project.id}:${chapter.id}` : null,
    [project.id, chapter?.id],
  );
  const generationRecoveryKey = useMemo(
    () =>
      chapter
        ? `${GENERATION_RECOVERY_PREFIX}:${project.id}:${chapter.id}`
        : null,
    [project.id, chapter?.id],
  );
  const persistSteeringPrompt = useCallback(
    (value: string) => {
      if (!steeringPromptKey || typeof window === "undefined") return;

      if (value.trim().length === 0) {
        safeLocalStorageRemove(steeringPromptKey);
      } else {
        safeLocalStorageSet(steeringPromptKey, value);
      }
    },
    [steeringPromptKey],
  );

  useEffect(() => {
    isMountedRef.current = true;
    return (): void => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    return (): void => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      if (localDraftTimeoutRef.current)
        clearTimeout(localDraftTimeoutRef.current);
      if (sliderDebounceRef.current) clearTimeout(sliderDebounceRef.current);
    };
  }, []);

  useEffect(() => {
    if (!steeringPromptKey || typeof window === "undefined") {
      setPrompt("");
      return;
    }

    try {
      setPrompt(safeLocalStorageGet(steeringPromptKey) || "");
    } catch (storageError) {
      console.error("Failed to restore steering prompt:", storageError);
      setPrompt("");
    }
  }, [steeringPromptKey]);

  useEffect(() => {
    persistSteeringPrompt(prompt);
  }, [persistSteeringPrompt, prompt]);

  const persistLocalDraft = useCallback(
    (content: string) => {
      if (!draftKey || !chapter || typeof window === "undefined") return;

      try {
        safeLocalStorageSet(
          draftKey,
          JSON.stringify({
            projectId: project.id,
            chapterId: chapter.id,
            chapterTitle: chapter.title,
            content,
            savedAt: new Date().toISOString(),
          }),
        );
        const nextReady = content !== lastSavedContentRef.current;
        setLocalBackupReady((previous) =>
          previous === nextReady ? previous : nextReady,
        );
      } catch (storageError) {
        console.error("Failed to persist local draft:", storageError);
      }
    },
    [chapter, draftKey, project.id],
  );

  const clearLocalDraft = useCallback(() => {
    if (!draftKey || typeof window === "undefined") return;

    safeLocalStorageRemove(draftKey);

    setLocalBackupReady((previous) => (previous ? false : previous));
  }, [draftKey]);

  const persistGenerationRecovery = useCallback(
    (entry: StoredGenerationRecovery) => {
      if (!generationRecoveryKey || typeof window === "undefined") return;

      safeLocalStorageSet(generationRecoveryKey, JSON.stringify(entry));
    },
    [generationRecoveryKey],
  );

  const clearGenerationRecovery = useCallback(() => {
    safeLocalStorageRemove(generationRecoveryKey);

    pendingGenerationDraftIdRef.current = null;
    setGenerationRecoveryNotice(null);
  }, [generationRecoveryKey]);

  const resolveGenerationRecovery = useCallback(
    async (status: "persisted" | "dismissed", draftId?: string | null) => {
      const activeDraftId = draftId || pendingGenerationDraftIdRef.current;
      clearGenerationRecovery();

      if (!activeDraftId) return;

      try {
        await api.generation.resolveRecoveryDraft(activeDraftId, status);
      } catch (error) {
        console.error("Failed to resolve generation recovery draft:", error);
      }
    },
    [clearGenerationRecovery],
  );

  const flushCrashRecovery = useCallback(
    (content: string, sendBeacon = false) => {
      if (!chapter || !content.trim()) return;

      persistLocalDraft(content);

      if (
        sendBeacon &&
        typeof navigator !== "undefined" &&
        content !== lastSavedContentRef.current &&
        typeof navigator.sendBeacon === "function"
      ) {
        const payload = new Blob(
          [
            JSON.stringify({
              content,
              trigger: "pagehide",
              generationDraftId:
                pendingGenerationDraftIdRef.current || undefined,
            }),
          ],
          {
            type: "application/json",
          },
        );
        navigator.sendBeacon(`${API}/api/chapters/${chapter.id}/save`, payload);
      }
    },
    [chapter, persistLocalDraft],
  );

  // Sync display value when actual value changes (e.g., from parent)
  useEffect(() => {
    setTargetWordsDisplay(targetWords);
  }, [targetWords]);

  // Ironclad save - uses triple redundancy endpoint
  const ironcladSave = useCallback(
    async (
      content: string,
      trigger: string,
      options?: { generationDraftId?: string | null },
    ): Promise<boolean> => {
      if (!chapter) return false;

      // Prevent duplicate saves of same content
      if (
        content === lastSavedContentRef.current &&
        Date.now() - lastSaveRef.current < 1000
      ) {
        return true;
      }

      lastSaveRef.current = Date.now();
      setAutoSaveStatus("saving");
      persistLocalDraft(content);

      try {
        const saveResult = await api.chapters.save(chapter.id, {
          content,
          trigger,
          generationDraftId: options?.generationDraftId || undefined,
        });
        lastSavedContentRef.current = content;
        clearLocalDraft();
        setAutoSaveStatus("saved");
        onChapterLocalUpdate(chapter.id, {
          content,
          wordCount: saveResult.wordCount,
        });
        if (options?.generationDraftId) {
          clearGenerationRecovery();
        }
        return true;
      } catch (e) {
        console.error("Ironclad save failed:", e);
        setAutoSaveStatus("unsaved");
        // Fallback to regular save
        try {
          lastSavedContentRef.current = content;
          await onChapterUpdate(chapter.id, { content });
          clearLocalDraft();
          setAutoSaveStatus("saved");
          if (options?.generationDraftId) {
            await resolveGenerationRecovery(
              "persisted",
              options.generationDraftId,
            );
          }
          return true;
        } catch (fallbackError) {
          console.error("Fallback save also failed:", fallbackError);
        }
        return false;
      }
    },
    [
      chapter,
      clearLocalDraft,
      clearGenerationRecovery,
      onChapterLocalUpdate,
      onChapterUpdate,
      persistLocalDraft,
      resolveGenerationRecovery,
    ],
  );

  // Detect save trigger from content change
  const detectSaveTrigger = useCallback(
    (oldContent: string, newContent: string): string | null => {
      if (newContent === oldContent) {
        return null;
      }

      if (newContent.length < oldContent.length) {
        // Deletion - don't trigger immediate save
        return null;
      }

      const diff = newContent.slice(oldContent.length);

      // Paragraph break: double newline
      if (/\n\n$/.test(newContent) || /<\/p>\s*<p>/.test(diff)) {
        return "paragraph";
      }

      // Paste detection: large content addition
      if (diff.length > 20) {
        return "paste";
      }

      return null;
    },
    [],
  );

  // Debounced slider handler to prevent excessive re-renders
  const handleTargetWordsChange = useCallback((value: number) => {
    setTargetWordsDisplay(value);
    if (sliderDebounceRef.current) {
      clearTimeout(sliderDebounceRef.current);
    }
    sliderDebounceRef.current = setTimeout(() => {
      setTargetWords(value);
    }, 150);
  }, []);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: "Begin writing your story...",
      }),
    ],
    content: chapter?.content || "",
    onUpdate: ({ editor }) => {
      if (suppressEditorUpdateRef.current) {
        suppressEditorUpdateRef.current = false;
        return;
      }

      const newContent = editor.getHTML();
      const oldContent = lastEditorContentRef.current;

      if (newContent === oldContent) {
        return;
      }

      lastEditorContentRef.current = newContent;

      setAutoSaveStatus((previous) =>
        previous === "unsaved" ? previous : "unsaved",
      );

      // Clear any pending idle save
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      if (localDraftTimeoutRef.current) {
        clearTimeout(localDraftTimeoutRef.current);
      }

      localDraftTimeoutRef.current = setTimeout(() => {
        persistLocalDraft(newContent);
      }, LOCAL_DRAFT_FLUSH_MS);

      // Detect if we should save immediately
      const trigger = detectSaveTrigger(oldContent, newContent);

      if (trigger) {
        // Immediate save on higher-signal edits (paragraph breaks, paste)
        ironcladSave(newContent, trigger);
      } else {
        // Save after a short pause instead of on every word boundary
        saveTimeoutRef.current = setTimeout(() => {
          ironcladSave(newContent, "idle");
        }, IDLE_SAVE_MS);
      }
    },
  });

  // Update editor when chapter changes
  useEffect(() => {
    if (editor && chapter) {
      const storedDraft = safeLocalStorageGet(draftKey);
      let parsedDraft: { content?: string; savedAt?: string } | null = null;
      if (storedDraft) {
        try {
          parsedDraft = JSON.parse(storedDraft) as {
            content?: string;
            savedAt?: string;
          };
        } catch (storageError) {
          console.error(
            "Failed to parse local draft recovery payload:",
            storageError,
          );
          safeLocalStorageRemove(draftKey);
        }
      }
      const recoveredContent =
        parsedDraft?.content && parsedDraft.content !== (chapter.content || "")
          ? parsedDraft.content
          : null;
      const nextContent = recoveredContent || chapter.content || "";
      const currentContent = editor.getHTML();

      lastEditorContentRef.current = nextContent;
      lastSavedContentRef.current = chapter.content || "";

      if (currentContent !== nextContent) {
        suppressEditorUpdateRef.current = true;
        editor.commands.setContent(nextContent);
      }

      if (recoveredContent) {
        const recoveredChars = Math.max(
          0,
          recoveredContent.length - (chapter.content || "").length,
        );
        setRecoveryNotice(
          `Recovered local draft from ${new Date(parsedDraft?.savedAt || Date.now()).toLocaleTimeString()} with about ${recoveredChars} characters beyond the last durable save.`,
        );
        setAutoSaveStatus("unsaved");
        void playUiSound("soft-alert");
        window.setTimeout(() => {
          void ironcladSave(recoveredContent, "recovered_local_draft");
        }, 0);
      } else {
        setRecoveryNotice(null);
        setAutoSaveStatus("saved");
      }
    }
  }, [chapter?.id, chapter?.content, draftKey, editor, ironcladSave]);

  useEffect(() => {
    if (!editor || !chapter) return undefined;

    const flushLiveDraft = (): void => {
      const liveContent = editor.getHTML();
      flushCrashRecovery(liveContent, true);
    };

    const handleVisibilityChange = (): void => {
      if (document.visibilityState === "hidden") {
        flushLiveDraft();
      }
    };

    window.addEventListener("pagehide", flushLiveDraft);
    window.addEventListener("beforeunload", flushLiveDraft);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return (): void => {
      window.removeEventListener("pagehide", flushLiveDraft);
      window.removeEventListener("beforeunload", flushLiveDraft);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [chapter, editor, flushCrashRecovery]);

  const queuePendingGeneratedContent = useCallback(
    (input: {
      text: string;
      anchor: GenerationAnchor | null;
      draftId?: string | null;
      autoAcceptRequested: boolean;
      promptText: string;
      notice?: string | null;
    }) => {
      pendingGenerationAnchorRef.current = input.anchor;
      lastGenerationAnchorRef.current = input.anchor;
      pendingGenerationDraftIdRef.current = input.draftId || null;
      setPendingContent(input.text);
      setGenerationRecoveryNotice(input.notice || null);
      persistGenerationRecovery({
        draftId: input.draftId || null,
        projectId: project.id,
        chapterId: chapter?.id || "",
        text: input.text,
        prompt: input.promptText,
        autoAcceptRequested: input.autoAcceptRequested,
        anchor: input.anchor,
        savedAt: new Date().toISOString(),
      });
    },
    [chapter?.id, persistGenerationRecovery, project.id],
  );

  useEffect(() => {
    if (!chapter || !generationRecoveryKey || typeof window === "undefined") {
      pendingGenerationDraftIdRef.current = null;
      setGenerationRecoveryNotice(null);
      return;
    }

    let cancelled = false;

    const restoreGenerationRecovery = async (): Promise<void> => {
      const storedRaw = safeLocalStorageGet(generationRecoveryKey);
      let storedDraft: StoredGenerationRecovery | null = null;
      if (storedRaw) {
        try {
          storedDraft = JSON.parse(storedRaw) as StoredGenerationRecovery;
        } catch (error) {
          console.error("Failed to parse stored generation recovery:", error);
          safeLocalStorageRemove(generationRecoveryKey);
        }
      }

      if (storedDraft?.draftId) {
        try {
          const remoteDraft = await api.generation.getRecoveryDraft(
            storedDraft.draftId,
          );
          if (cancelled) return;

          if (!remoteDraft || remoteDraft.status !== "pending") {
            safeLocalStorageRemove(generationRecoveryKey);
            pendingGenerationDraftIdRef.current = null;
            setGenerationRecoveryNotice(null);
            return;
          }

          if (!pendingContent) {
            pendingGenerationAnchorRef.current = storedDraft.anchor;
            lastGenerationAnchorRef.current = storedDraft.anchor;
            pendingGenerationDraftIdRef.current = remoteDraft.id;
            setPendingContent(storedDraft.text || remoteDraft.text);
            setGenerationRecoveryNotice(
              storedDraft.autoAcceptRequested
                ? "Recovered an interrupted auto-accepted generation before it reached durable chapter storage. Review and accept to restore it."
                : "Recovered a generated draft that was waiting for your review.",
            );
          }
          return;
        } catch (error) {
          console.error("Failed to verify stored generation recovery:", error);
        }
      }

      if (storedDraft) {
        safeLocalStorageRemove(generationRecoveryKey);
      }

      try {
        const latestDraft = await api.generation.getLatestRecoveryDraft(
          project.id,
          chapter.id,
        );
        if (cancelled || !latestDraft || latestDraft.status !== "pending") {
          return;
        }

        if (!pendingContent) {
          pendingGenerationAnchorRef.current = null;
          lastGenerationAnchorRef.current = null;
          pendingGenerationDraftIdRef.current = latestDraft.id;
          setPendingContent(latestDraft.text);
          setGenerationRecoveryNotice(
            "Recovered a server-side generated draft after an interrupted session. Review and accept to restore it.",
          );
          persistGenerationRecovery({
            draftId: latestDraft.id,
            projectId: project.id,
            chapterId: chapter.id,
            text: latestDraft.text,
            prompt: "",
            autoAcceptRequested: false,
            anchor: null,
            savedAt: new Date().toISOString(),
          });
        }
      } catch (error) {
        console.error(
          "Failed to load latest generation recovery draft:",
          error,
        );
      }
    };

    void restoreGenerationRecovery();

    return (): void => {
      cancelled = true;
    };
  }, [
    chapter,
    generationRecoveryKey,
    pendingContent,
    project.id,
    persistGenerationRecovery,
  ]);

  // Get cursor context for 10k bidirectional context
  const getCursorContext = useCallback(() => {
    if (!editor) {
      return {
        before: "",
        after: "",
        selectionFrom: 0,
        selectionTo: 0,
        selectedText: "",
      } satisfies CursorContextSnapshot;
    }

    const { from, to } = editor.state.selection;
    const doc = editor.state.doc;

    return {
      before: doc.textBetween(0, from, "\n\n", " ").slice(-10000),
      after: doc.textBetween(to, doc.content.size, "\n\n", " ").slice(0, 10000),
      selectionFrom: from,
      selectionTo: to,
      selectedText: doc.textBetween(from, to, "\n\n", " "),
    } satisfies CursorContextSnapshot;
  }, [editor]);

  const buildGenerationAnchor = useCallback(
    (context: CursorContextSnapshot): GenerationAnchor => ({
      chapterId: chapter?.id || null,
      from: context.selectionFrom,
      to: context.selectionTo,
    }),
    [chapter?.id],
  );

  const captureGenerateContext = useCallback(() => {
    capturedGenerateContextRef.current = getCursorContext();
  }, [getCursorContext]);

  const generate = async (customPrompt?: string): Promise<void> => {
    if (!editor) return;
    let anchor: GenerationAnchor | null = null;
    let finalPrompt = customPrompt || prompt || "";

    if (isMountedRef.current) {
      setIsGenerating(true);
      setError(null);
    }

    try {
      // Capture context at generation time if not already captured (fallback)
      const context = capturedGenerateContextRef.current || getCursorContext();
      capturedGenerateContextRef.current = null;
      anchor = buildGenerationAnchor(context);

      // Build the prompt - use custom prompt, or user's steering instruction, or a context-aware default
      const basePrompt = customPrompt || prompt || "";
      finalPrompt =
        nonfictionMode && !basePrompt.includes("[NONFICTION]")
          ? basePrompt
            ? `[NONFICTION] ${basePrompt}`
            : "[NONFICTION]"
          : basePrompt;

      // Log for debugging
      console.log("[Editor.generate] Context captured:", {
        beforeLen: context.before.length,
        afterLen: context.after.length,
        prompt: finalPrompt.slice(0, 100) || "(empty)",
        targetWords,
      });

      const result = await api.generation.generate({
        projectId: project.id,
        chapterId: chapter?.id,
        contextBefore: context.before,
        contextAfter: context.after,
        prompt: finalPrompt,
        targetWords,
        checkQuality: true,
      });
      if (!isMountedRef.current) return;
      setLastGeneration(result);

      const shouldAutoAccept =
        autoAccept && result.accepted !== false && !result.qualityFallback;

      // Auto-accept only when quality gates were truly accepted.
      if (shouldAutoAccept) {
        persistGenerationRecovery({
          draftId: result.recoveryDraftId || null,
          projectId: project.id,
          chapterId: chapter?.id || "",
          text: result.text,
          prompt: finalPrompt,
          autoAcceptRequested: true,
          anchor,
          savedAt: new Date().toISOString(),
        });
        pendingGenerationDraftIdRef.current = result.recoveryDraftId || null;
        const saved = await commitGeneratedContent(
          result.text,
          anchor,
          "auto_accepted_generation",
          result.recoveryDraftId,
        );
        pendingGenerationAnchorRef.current = null;
        lastGenerationAnchorRef.current = null;
        if (!saved && isMountedRef.current) {
          setError(
            "Generated content was preserved for recovery, but the chapter save did not finish. Reopen the scene to restore it.",
          );
        }
      } else {
        queuePendingGeneratedContent({
          text: result.text,
          anchor,
          draftId: result.recoveryDraftId,
          autoAcceptRequested: autoAccept,
          promptText: finalPrompt,
        });
        if (isMountedRef.current) {
          if (autoAccept && !shouldAutoAccept) {
            setError(
              result.qualityFallbackReason ||
                "Auto-accept was bypassed because quality gates were not fully met. Review and accept manually.",
            );
          }
        }
      }
    } catch (e) {
      const errorMessage =
        e instanceof Error ? e.message : "An unexpected error occurred";
      if (isMountedRef.current) {
        setError(errorMessage);
        const payload = (e as Error & { payload?: unknown }).payload as
          | {
              accepted?: boolean;
              code?: string;
              error?: string;
              fallbackAvailable?: boolean;
              qualityIssues?: string[];
              qualityScore?: number;
              recoveryDraftId?: string;
              text?: string;
              wordCount?: number;
            }
          | undefined;
        if (
          payload &&
          payload.code === "PROMPT_PLANNER_EMBEDDING_UNAVAILABLE" &&
          payload.fallbackAvailable
        ) {
          setPlannerFallbackNotice({
            message:
              payload.error ||
              "Embedding model unavailable for prompt planner.",
            canFallback: true,
          });
        } else if (payload && typeof payload.text === "string" && anchor) {
          setPlannerFallbackNotice(null);
          setLastGeneration({
            text: payload.text,
            wordCount:
              payload.wordCount ||
              payload.text.split(/\s+/).filter(Boolean).length,
            qualityScore: payload.qualityScore || 0,
            qualityIssues: payload.qualityIssues,
            accepted: payload.accepted,
            recoveryDraftId: payload.recoveryDraftId,
            metadata: {
              tokens: 0,
              latencyMs: 0,
              attempts: 0,
              accepted: payload.accepted,
            },
          });
          queuePendingGeneratedContent({
            text: payload.text,
            anchor,
            draftId: payload.recoveryDraftId,
            autoAcceptRequested: false,
            promptText: finalPrompt,
            notice:
              "Recovered a generation draft that was blocked from auto-insertion. Review and accept to keep it.",
          });
        } else {
          setPlannerFallbackNotice(null);
        }
      }
    } finally {
      if (isMountedRef.current) setIsGenerating(false);
    }
  };

  // Convert plain text with newlines to HTML for TipTap
  const escapeHtml = (value: string): string =>
    value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const textToHtml = (text: string): string => {
    return text
      .split(/\n\n+/)
      .map((para) => para.trim())
      .filter((para) => para.length > 0)
      .map((para) => `<p>${escapeHtml(para).replace(/\n/g, "<br>")}</p>`)
      .join("");
  };

  const insertGeneratedContent = useCallback(
    (text: string, anchor?: GenerationAnchor | null) => {
      if (!editor) return;

      const target =
        anchor && anchor.chapterId === chapter?.id
          ? {
              from: Math.max(
                0,
                Math.min(anchor.from, editor.state.doc.content.size),
              ),
              to: Math.max(
                0,
                Math.min(anchor.to, editor.state.doc.content.size),
              ),
            }
          : {
              from: editor.state.selection.from,
              to: editor.state.selection.to,
            };

      editor.chain().focus().insertContentAt(target, textToHtml(text)).run();
    },
    [chapter?.id, editor],
  );

  const commitGeneratedContent = useCallback(
    async (
      text: string,
      anchor: GenerationAnchor | null,
      trigger: string,
      generationDraftId?: string | null,
    ): Promise<boolean> => {
      if (!editor) return false;

      insertGeneratedContent(text, anchor);
      const newContent = editor.getHTML();
      return ironcladSave(newContent, trigger, { generationDraftId });
    },
    [editor, insertGeneratedContent, ironcladSave],
  );

  const acceptPendingContent = useCallback(() => {
    if (!editor || !pendingContent) return;
    void commitGeneratedContent(
      pendingContent,
      pendingGenerationAnchorRef.current,
      "accepted_generation",
      pendingGenerationDraftIdRef.current,
    );
    setPendingContent(null);
    pendingGenerationAnchorRef.current = null;
    lastGenerationAnchorRef.current = null;
  }, [editor, commitGeneratedContent, pendingContent]);

  const rejectPendingContent = useCallback(() => {
    setPendingContent(null);
    pendingGenerationAnchorRef.current = null;
    lastGenerationAnchorRef.current = null;
    void resolveGenerationRecovery("dismissed");
  }, [resolveGenerationRecovery]);

  const regenerate = async (): Promise<void> => {
    if (!lastGeneration || !editor) return;

    if (isMountedRef.current) {
      setIsGenerating(true);
      setError(null);
    }

    try {
      const context = capturedGenerateContextRef.current || getCursorContext();
      capturedGenerateContextRef.current = null;
      const anchor = buildGenerationAnchor(context);
      const lastAnchor = lastGenerationAnchorRef.current;
      const sameTarget =
        !!lastAnchor &&
        lastAnchor.chapterId === anchor.chapterId &&
        lastAnchor.from === anchor.from &&
        lastAnchor.to === anchor.to;

      if (!sameTarget) {
        await generate(prompt || "Continue the story naturally");
        return;
      }

      const result = await api.generation.retry({
        projectId: project.id,
        chapterId: chapter?.id,
        previousText: lastGeneration.text,
        feedback: prompt || "Try a different approach",
        contextBefore: context.before,
        contextAfter: context.after,
      });
      if (!isMountedRef.current) return;
      setLastGeneration({
        text: result.text,
        wordCount: result.wordCount,
        qualityScore: 0.8,
        qualityIssues: result.qualityIssues,
        qualityFallback: result.qualityFallback,
        accepted: result.qualityFallback ? false : true,
        qualityFallbackReason: result.qualityFallback
          ? "Retry returned with residual quality flags; review before inserting."
          : undefined,
        metadata: { tokens: 0, latencyMs: 0, attempts: 1 },
      });

      const shouldAutoAcceptRetry = autoAccept && !result.qualityFallback;
      if (shouldAutoAcceptRetry) {
        persistGenerationRecovery({
          draftId: result.recoveryDraftId || null,
          projectId: project.id,
          chapterId: chapter?.id || "",
          text: result.text,
          prompt,
          autoAcceptRequested: true,
          anchor,
          savedAt: new Date().toISOString(),
        });
        pendingGenerationDraftIdRef.current = result.recoveryDraftId || null;
        const saved = await commitGeneratedContent(
          result.text,
          anchor,
          "auto_accepted_generation_retry",
          result.recoveryDraftId,
        );
        pendingGenerationAnchorRef.current = null;
        lastGenerationAnchorRef.current = null;
        if (!saved && isMountedRef.current) {
          setError(
            "Retried content was preserved for recovery, but the chapter save did not finish. Reopen the scene to restore it.",
          );
        }
      } else {
        queuePendingGeneratedContent({
          text: result.text,
          anchor,
          draftId: result.recoveryDraftId,
          autoAcceptRequested: autoAccept,
          promptText: prompt,
        });
        if (isMountedRef.current) {
          if (autoAccept && !shouldAutoAcceptRetry) {
            setError(
              "Auto-accept was bypassed because retry output still had quality flags. Review and accept manually.",
            );
          }
        }
      }
    } catch (e) {
      if (isMountedRef.current) setError(String(e));
    } finally {
      if (isMountedRef.current) setIsGenerating(false);
    }
  };

  // Word count computed on each render - intentionally not memoized
  // as editor content changes frequently and memoization wouldn't help
  const wordCount = editor
    ? editor.getText().split(/\s+/).filter(Boolean).length
    : 0;
  const saveStatusTone =
    autoSaveStatus === "saved"
      ? "text-green-600"
      : autoSaveStatus === "saving"
        ? "text-amber-600"
        : "text-stone-400";
  const saveStatusLabel =
    autoSaveStatus === "saved"
      ? "Saved"
      : autoSaveStatus === "saving"
        ? "Saving..."
        : "Unsaved";

  // Get current chapter's outline from Story Bible
  const chapterOutline = useMemo((): ChapterOutline | null => {
    return resolveChapterOutline(chapter, project.storyBible?.chapterOutlines);
  }, [chapter, project.storyBible?.chapterOutlines]);

  return (
    <div className="editor-shell flex h-[calc(100vh-3.5rem)]">
      {/* Chapter Sidebar */}
      {showChapterList && (
        <div className="env-rail editor-sidebar w-64 border-r border-stone-200 flex flex-col">
          <div className="p-4 border-b border-stone-200">
            <h2 className="font-semibold text-stone-800">Chapters</h2>
          </div>
          <div className="flex-1 overflow-auto">
            {chapters.map((ch) => (
              <div
                key={ch.id}
                className={`flex items-center border-b border-stone-100 ${
                  chapter?.id === ch.id
                    ? "env-surface-stone-100"
                    : "env-hover-stone-50"
                }`}
              >
                <button
                  onClick={() => onChapterChange(ch)}
                  className="flex-1 px-4 py-3 text-left"
                >
                  <div className="font-medium text-stone-800">{ch.title}</div>
                  <div className="text-sm text-stone-500">
                    {ch.wordCount} words
                  </div>
                </button>
                {chapters.length > 1 && (
                  <button
                    onClick={() => onDeleteChapter(ch.id)}
                    className="env-hover-red-50 px-3 py-2 text-red-500 hover:text-red-700"
                    title="Delete chapter"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      />
                    </svg>
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="p-4 border-t border-stone-200">
            <button
              onClick={onAddChapter}
              className="w-full px-4 py-2 text-sm bg-stone-800 text-white rounded-lg hover:bg-stone-700"
            >
              + Add Chapter
            </button>
          </div>
        </div>
      )}

      {/* Main Editor */}
      <div className="env-workspace editor-main flex-1 flex flex-col">
        {/* Editor Toolbar */}
        <div className="env-toolbar editor-toolbar border-b border-stone-200 px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setShowChapterList(!showChapterList)}
              className="env-toolbar-button p-2 rounded"
              title="Toggle chapters"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              </svg>
            </button>
            {chapter && (
              <input
                type="text"
                value={chapter.title}
                onChange={(e) =>
                  onChapterUpdate(chapter.id, { title: e.target.value })
                }
                className="text-lg font-semibold bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-stone-300 rounded px-2 py-1"
              />
            )}
          </div>
          <div className="flex items-center gap-4 text-sm text-stone-500">
            <span>{wordCount} words</span>
            <div className="env-surface-stone-50 flex items-center gap-3 rounded-full border border-stone-200 px-3 py-1.5">
              <span
                className={`inline-block min-w-[4.75rem] font-medium ${saveStatusTone}`}
              >
                {saveStatusLabel}
              </span>
              <span
                className={`inline-flex items-center gap-2 text-xs font-medium ${localBackupReady ? "text-amber-700" : "text-stone-400"}`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${localBackupReady ? "bg-amber-500" : "bg-stone-300"}`}
                />
                {localBackupReady
                  ? "Local backup live"
                  : "Durable sync caught up"}
              </span>
            </div>
            <button
              onClick={() => setShowExportDialog(true)}
              className="env-surface-stone-100 hover:bg-stone-200 px-3 py-1 rounded text-stone-700 font-medium"
            >
              Export
            </button>
          </div>
        </div>

        {/* Export Dialog */}
        {showExportDialog && (
          <Suspense fallback={null}>
            <ExportDialog
              isOpen={showExportDialog}
              onClose={() => setShowExportDialog(false)}
              projectTitle={project.title}
              projectGenre={project.genre}
              chapters={chapters.map((c) => ({
                title: c.title,
                content: c.content,
              }))}
              currentChapterContent={chapter?.content}
              onMessage={({ type, text }) =>
                setError(type === "error" ? text : null)
              }
            />
          </Suspense>
        )}

        {recoveryNotice && (
          <div className="env-surface-amber-50 border-b border-amber-200 px-4 py-2 text-sm text-amber-900">
            {recoveryNotice}
          </div>
        )}

        {generationRecoveryNotice && (
          <div className="env-surface-amber-50 border-b border-amber-200 px-4 py-2 text-sm text-amber-900">
            {generationRecoveryNotice}
          </div>
        )}

        {/* Formatting Toolbar */}
        {editor && (
          <div className="env-toolbar editor-toolbar border-b border-stone-200 px-4 py-2 flex items-center gap-1">
            <FormatButton
              onClick={() => editor.chain().focus().toggleBold().run()}
              active={editor.isActive("bold")}
              title="Bold (Ctrl+B)"
            >
              <span className="font-bold">B</span>
            </FormatButton>
            <FormatButton
              onClick={() => editor.chain().focus().toggleItalic().run()}
              active={editor.isActive("italic")}
              title="Italic (Ctrl+I)"
            >
              <span className="italic">I</span>
            </FormatButton>
            <FormatButton
              onClick={() => editor.chain().focus().toggleStrike().run()}
              active={editor.isActive("strike")}
              title="Strikethrough"
            >
              <span className="line-through">S</span>
            </FormatButton>
            <div className="w-px h-6 bg-stone-200 mx-2" />
            <FormatButton
              onClick={() =>
                editor.chain().focus().toggleHeading({ level: 1 }).run()
              }
              active={editor.isActive("heading", { level: 1 })}
              title="Heading 1"
            >
              H1
            </FormatButton>
            <FormatButton
              onClick={() =>
                editor.chain().focus().toggleHeading({ level: 2 }).run()
              }
              active={editor.isActive("heading", { level: 2 })}
              title="Heading 2"
            >
              H2
            </FormatButton>
            <FormatButton
              onClick={() =>
                editor.chain().focus().toggleHeading({ level: 3 }).run()
              }
              active={editor.isActive("heading", { level: 3 })}
              title="Heading 3"
            >
              H3
            </FormatButton>
            <div className="w-px h-6 bg-stone-200 mx-2" />
            <FormatButton
              onClick={() => editor.chain().focus().toggleBulletList().run()}
              active={editor.isActive("bulletList")}
              title="Bullet List"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              </svg>
            </FormatButton>
            <FormatButton
              onClick={() => editor.chain().focus().toggleOrderedList().run()}
              active={editor.isActive("orderedList")}
              title="Numbered List"
            >
              <span className="text-xs">1.</span>
            </FormatButton>
            <FormatButton
              onClick={() => editor.chain().focus().toggleBlockquote().run()}
              active={editor.isActive("blockquote")}
              title="Quote"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
                />
              </svg>
            </FormatButton>
            <div className="w-px h-6 bg-stone-200 mx-2" />
            <FormatButton
              onClick={() => editor.chain().focus().setHorizontalRule().run()}
              title="Horizontal Rule"
            >
              <span className="text-xs">—</span>
            </FormatButton>
            <FormatButton
              onClick={() => editor.chain().focus().undo().run()}
              disabled={!editor.can().undo()}
              title="Undo (Ctrl+Z)"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
                />
              </svg>
            </FormatButton>
            <FormatButton
              onClick={() => editor.chain().focus().redo().run()}
              disabled={!editor.can().redo()}
              title="Redo (Ctrl+Shift+Z)"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 10h-10a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6"
                />
              </svg>
            </FormatButton>
          </div>
        )}

        {/* Editor Content */}
        <div className="env-canvas editor-canvas flex-1 overflow-auto">
          <div className="editor-page mx-auto w-full py-8 px-4">
            <EditorContent
              editor={editor}
              className="env-paper editor-prose prose prose-stone max-w-none min-h-[60vh] focus:outline-none"
            />
          </div>
        </div>

        {/* Generation Context Info */}
        {editor && (
          <div className="env-toolbar editor-toolbar env-surface-stone-100 border-t border-stone-200 px-4 py-2 text-xs text-stone-500">
            Context: {getCursorContext().before.length} chars before cursor,{" "}
            {getCursorContext().after.length} chars after (10k max each
            direction)
          </div>
        )}
      </div>

      {/* Generation Sidebar */}
      <div className="editor-generation-shell env-rail editor-sidebar w-80 border-l border-stone-200 flex flex-col">
        <div className="p-4 border-b border-stone-200">
          <h2 className="font-semibold text-stone-800">AI Generation</h2>
        </div>

        {/* Chapter Beats from Story Bible */}
        {chapterOutline && (
          <div className="env-surface-purple-50 border-b border-stone-200">
            <button
              onClick={() => setBeatsExpanded(!beatsExpanded)}
              className="w-full p-4 flex items-center justify-between text-left hover:bg-purple-100/50 transition-colors"
            >
              <h3 className="text-sm font-semibold text-purple-800">
                Chapter {chapterOutline.chapterNumber} Beats
              </h3>
              <div className="flex items-center gap-2">
                <span className="env-surface-purple-100 text-xs text-purple-600 px-2 py-0.5 rounded-full">
                  {chapterOutline.beats.length} beats
                </span>
                <span
                  className={`text-purple-400 text-xs transition-transform ${beatsExpanded ? "rotate-180" : ""}`}
                >
                  &#9660;
                </span>
              </div>
            </button>
            {beatsExpanded && (
              <div className="px-4 pb-4">
                <ul className="space-y-1.5">
                  {chapterOutline.beats.map((beat, i) => (
                    <li
                      key={i}
                      className="text-xs text-purple-700 flex items-start gap-2"
                    >
                      <span className="text-purple-400 font-mono">
                        {i + 1}.
                      </span>
                      <span>{beat}</span>
                    </li>
                  ))}
                </ul>
                {chapterOutline.location && (
                  <div className="mt-2 pt-2 border-t border-purple-200 text-xs text-purple-600">
                    <span className="font-medium">Location:</span>{" "}
                    {chapterOutline.location}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div className="flex-1 overflow-auto p-4 space-y-4">
          {plannerFallbackNotice && (
            <div className="env-surface-amber-50 rounded-lg border border-amber-200 p-3 text-sm text-amber-900">
              <div className="font-medium mb-2">Prompt planner unavailable</div>
              <div className="mb-3">{plannerFallbackNotice.message}</div>
              {plannerFallbackNotice.canFallback && (
                <button
                  onClick={async () => {
                    await api.preferences.update({
                      generationSettings: {
                        promptPlannerFallbackMode: "lexical",
                      },
                    });
                    setPlannerFallbackNotice(null);
                    setError(null);
                  }}
                  className="px-3 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 text-sm"
                >
                  Enable Lexical Fallback
                </button>
              )}
            </div>
          )}
          {/* Prompt Input */}
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">
              Instructions (optional)
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g., Write a tense confrontation scene..."
              rows={3}
              className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-stone-400"
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={nonfictionMode}
              onChange={(e) => setNonfictionMode(e.target.checked)}
              className="rounded"
            />
            <span className="text-stone-600">Nonfiction mode</span>
          </label>

          {/* Target Words */}
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">
              Target Words: {targetWordsDisplay}
            </label>
            <input
              type="range"
              min={100}
              max={5000}
              step={100}
              value={targetWordsDisplay}
              onChange={(e) => handleTargetWordsChange(Number(e.target.value))}
              className="w-full"
            />
          </div>

          {/* Auto-Accept Toggle */}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={autoAccept}
              onChange={(e) => setAutoAccept(e.target.checked)}
              className="rounded"
            />
            <span className="text-stone-600">Auto-accept (skip preview)</span>
          </label>

          {/* Generate Button */}
          <button
            onMouseDown={captureGenerateContext}
            onClick={() => generate()}
            disabled={isGenerating || !!pendingContent}
            className="w-full px-4 py-3 bg-stone-800 text-white rounded-lg hover:bg-stone-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          >
            {isGenerating ? (
              <span className="flex items-center justify-center gap-2">
                <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></span>
                Generating...
              </span>
            ) : pendingContent ? (
              "Review pending content below"
            ) : (
              "Generate"
            )}
          </button>

          {/* Preview Panel - shown when there's pending content */}
          {pendingContent && (
            <div className="env-surface-amber-50 border-2 border-amber-300 rounded-lg p-3 space-y-3">
              <div className="text-xs font-medium text-amber-700 uppercase tracking-wide">
                Preview - Not Yet Added
              </div>
              <div className="env-surface-white border border-amber-200 rounded p-3 max-h-48 overflow-y-auto font-serif text-sm text-stone-700 leading-relaxed">
                {pendingContent}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={acceptPendingContent}
                  className="flex-1 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium text-sm"
                >
                  Accept
                </button>
                <button
                  onClick={rejectPendingContent}
                  className="flex-1 px-3 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 font-medium text-sm"
                >
                  Reject
                </button>
              </div>
              <div className="text-xs text-amber-600">
                {pendingContent.split(/\s+/).filter(Boolean).length} words •
                Review before adding to document
              </div>
            </div>
          )}

          {/* Error Display */}
          {error && (
            <div className="env-surface-red-50 p-3 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          {/* Last Generation Info */}
          {lastGeneration && (
            <div className="env-surface-stone-100 p-3 rounded-lg text-sm space-y-2">
              <div className="flex justify-between">
                <span className="text-stone-600">Last generation</span>
                <span className="font-medium">
                  {lastGeneration.wordCount} words
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-600">Quality score</span>
                <span
                  className={`font-medium ${lastGeneration.qualityScore >= 0.75 ? "text-green-600" : "text-amber-600"}`}
                >
                  {Math.round(lastGeneration.qualityScore * 100)}%
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-600">Time</span>
                <span className="font-medium">
                  {(lastGeneration.metadata.latencyMs / 1000).toFixed(1)}s
                </span>
              </div>
              {lastGeneration.qualityFallback && (
                <div className="env-surface-amber-50 rounded-md border border-amber-200 p-2 text-xs text-amber-800">
                  <p className="font-medium">Best-effort fallback used</p>
                  <p>
                    {lastGeneration.qualityFallbackReason ||
                      "Quality gates were not fully met, but text was returned to avoid a blank paid result."}
                  </p>
                </div>
              )}
              {lastGeneration.qualityIssues &&
                lastGeneration.qualityIssues.length > 0 && (
                  <div className="env-surface-white rounded-md border border-stone-200 p-2 text-xs text-stone-700">
                    <p className="font-medium text-stone-800">
                      Top quality flag
                    </p>
                    <p>{lastGeneration.qualityIssues[0]}</p>
                  </div>
                )}
              <button
                onMouseDown={captureGenerateContext}
                onClick={regenerate}
                disabled={isGenerating}
                className="w-full mt-2 px-3 py-2 border border-stone-300 rounded-lg text-sm hover:bg-stone-50 disabled:opacity-50"
              >
                Regenerate with feedback
              </button>
            </div>
          )}

          {/* Features Info */}
          <div className="env-surface-blue-50 p-3 border border-blue-100 rounded-lg text-sm text-blue-800">
            <p className="font-medium mb-1">10k Bidirectional Context</p>
            <p className="text-blue-700 text-xs">
              The AI sees up to 10,000 characters before AND after your cursor,
              enabling seamless insertions anywhere in your text.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function FormatButton({
  children,
  onClick,
  active,
  disabled,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title?: string;
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`env-toolbar-button p-2 text-sm rounded disabled:opacity-30 disabled:cursor-not-allowed ${
        active ? "env-toolbar-button-active text-stone-900" : "text-stone-600"
      }`}
    >
      {children}
    </button>
  );
}
