import {
  useState,
  useEffect,
  useCallback,
  useRef,
  lazy,
  Suspense,
} from "react";
import { ProjectList } from "./components/ProjectList";
import { api } from "./api/client";
import type {
  Chapter,
  Project,
  ProjectSummary,
  View,
} from "./types/magnumOpus";
import { playUiSound } from "./utils/uiSound";

const EditorView = lazy(() =>
  import("./components/Editor").then((module) => ({ default: module.Editor })),
);
const StoryBibleView = lazy(() =>
  import("./components/StoryBible").then((module) => ({
    default: module.StoryBible,
  })),
);
const StyleLearningView = lazy(() =>
  import("./components/StyleLearning").then((module) => ({
    default: module.StyleLearning,
  })),
);
const SettingsView = lazy(() =>
  import("./components/Settings").then((module) => ({
    default: module.Settings,
  })),
);
const AutonomousWriterView = lazy(() =>
  import("./components/AutonomousWriter").then((module) => ({
    default: module.AutonomousWriter,
  })),
);
const MetricsDashboardView = lazy(() =>
  import("./components/MetricsDashboard").then((module) => ({
    default: module.MetricsDashboard,
  })),
);
const MagnumBackground = lazy(() => import("./components/MagnumBackground"));

export default function App(): React.JSX.Element {
  const POLL_AUTONOMOUS_MS = 2000;
  const INITIAL_AUTONOMOUS_POLL_MS = 1500;
  const [view, setView] = useState<View>("projects");
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [currentChapter, setCurrentChapter] = useState<Chapter | null>(null);
  const [appError, setAppError] = useState<string | null>(null);
  const [serverStatus, setServerStatus] = useState<
    "checking" | "online" | "offline"
  >("checking");
  const [showBackground, setShowBackground] = useState(false);
  const currentProjectRef = useRef<Project | null>(null);
  const currentChapterRef = useRef<Chapter | null>(null);
  const isMountedRef = useRef(true);
  const lastRefreshAtRef = useRef(0);
  const autonomousSyncRef = useRef<{
    sessionId: string | null;
    generatedWords: number;
    lastCommittedAt: string | null;
  }>({
    sessionId: null,
    generatedWords: 0,
    lastCommittedAt: null,
  });

  useEffect(() => {
    isMountedRef.current = true;
    return (): void => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    currentProjectRef.current = currentProject;
    currentChapterRef.current = currentChapter;
  }, [currentChapter, currentProject]);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let idleId: number | null = null;

    const enableBackground = (): void => {
      if (isMountedRef.current) {
        setShowBackground(true);
      }
    };

    if (
      typeof window !== "undefined" &&
      "requestIdleCallback" in window &&
      typeof window.requestIdleCallback === "function"
    ) {
      idleId = window.requestIdleCallback(enableBackground, { timeout: 500 });
    } else {
      timeoutId = setTimeout(enableBackground, 120);
    }

    return (): void => {
      if (
        idleId !== null &&
        typeof window !== "undefined" &&
        "cancelIdleCallback" in window &&
        typeof window.cancelIdleCallback === "function"
      ) {
        window.cancelIdleCallback(idleId);
      }
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, []);

  // Check server status
  useEffect(() => {
    let cancelled = false;
    api.health
      .get()
      .then(() => {
        if (!cancelled && isMountedRef.current) setServerStatus("online");
      })
      .catch(() => {
        if (!cancelled && isMountedRef.current) setServerStatus("offline");
      });
    return (): void => {
      cancelled = true;
    };
  }, []);

  // Load projects
  useEffect(() => {
    if (serverStatus === "online") {
      setProjectsLoading(true);
      api.projects
        .list()
        .then((data) => {
          if (isMountedRef.current) {
            setProjects(Array.isArray(data) ? data : []);
          }
        })
        .catch(console.error)
        .finally(() => {
          if (isMountedRef.current) {
            setProjectsLoading(false);
          }
        });
    } else if (serverStatus === "offline") {
      setProjectsLoading(false);
    }
  }, [serverStatus]);

  const createProject = async (title: string, genre: string): Promise<void> => {
    try {
      const project = await api.projects.create({ title, genre });
      setProjects((previous) => [...previous, project]);
      setCurrentProject(project);
      setCurrentChapter(project.chapters[0] || null);
      setView("editor");
      setAppError(null);
    } catch (error) {
      setAppError(
        error instanceof Error ? error.message : "Failed to create project",
      );
    }
  };

  const openProject = async (id: string): Promise<void> => {
    try {
      const project = await api.projects.get(id);
      setCurrentProject(project);
      setCurrentChapter(project.chapters[0] || null);
      setView("editor");
      setAppError(null);
    } catch (error) {
      setAppError(
        error instanceof Error ? error.message : "Failed to open project",
      );
    }
  };

  const deleteProject = async (id: string): Promise<void> => {
    try {
      await api.projects.remove(id);
      setProjects((previous) =>
        previous.filter((project) => project.id !== id),
      );
      if (currentProject?.id === id) {
        setCurrentProject(null);
        setCurrentChapter(null);
        setView("projects");
      }
      setAppError(null);
    } catch (error) {
      setAppError(
        error instanceof Error ? error.message : "Failed to delete project",
      );
    }
  };

  const updateProject = async (updates: Partial<Project>): Promise<void> => {
    const activeProject = currentProjectRef.current;
    if (!activeProject) return;
    try {
      const updated = await api.projects.update(activeProject.id, updates);
      if (!isMountedRef.current) return;
      setCurrentProject(updated);
      setProjects((previous) =>
        previous.map((project) =>
          project.id === updated.id ? updated : project,
        ),
      );
      setAppError(null);
    } catch (error) {
      setAppError(
        error instanceof Error ? error.message : "Failed to update project",
      );
    }
  };

  const updateChapterLocally = useCallback(
    (chapterId: string, updates: Partial<Chapter>): void => {
      setCurrentProject((previous) => {
        if (!previous) return previous;
        const newChapters = previous.chapters.map((chapter) =>
          chapter.id === chapterId ? { ...chapter, ...updates } : chapter,
        );
        const wordCount = newChapters.reduce(
          (total, chapter) => total + (chapter.wordCount || 0),
          0,
        );
        return { ...previous, chapters: newChapters, wordCount };
      });

      setCurrentChapter((previous) =>
        previous && previous.id === chapterId
          ? { ...previous, ...updates }
          : previous,
      );
    },
    [],
  );

  const updateChapter = async (
    chapterId: string,
    updates: Partial<Chapter>,
  ): Promise<void> => {
    const activeProject = currentProjectRef.current;
    if (!activeProject) return;
    try {
      const updated = await api.projects.updateChapter(
        activeProject.id,
        chapterId,
        updates,
      );
      if (!isMountedRef.current) return;
      updateChapterLocally(chapterId, updated);
      setAppError(null);
    } catch (error) {
      setAppError(
        error instanceof Error ? error.message : "Failed to update chapter",
      );
    }
  };

  const refreshProject = useCallback(async (): Promise<void> => {
    const activeProject = currentProjectRef.current;
    if (!activeProject) return;
    const now = Date.now();
    if (now - lastRefreshAtRef.current < 1000) return;
    lastRefreshAtRef.current = now;

    const project = await api.projects.get(activeProject.id);
    if (!isMountedRef.current) return;
    setCurrentProject(project);
    setProjects((previous) =>
      previous.map((summary) =>
        summary.id === project.id ? project : summary,
      ),
    );

    const activeChapter = currentChapterRef.current;
    if (activeChapter) {
      const updatedChapter = project.chapters.find(
        (chapter) => chapter.id === activeChapter.id,
      );
      setCurrentChapter(updatedChapter || project.chapters[0] || null);
    }
  }, []);

  useEffect(() => {
    if (!currentProject?.id || view !== "editor") {
      return;
    }

    let cancelled = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    const projectId = currentProject.id;

    const pollAutonomousSessions = async (): Promise<void> => {
      try {
        const activeSessions = await api.autonomous.list();
        const sessionSummary = activeSessions.find(
          (session) => session.projectId === projectId,
        );

        if (!sessionSummary) {
          const hadTrackedSession = Boolean(
            autonomousSyncRef.current.sessionId,
          );
          autonomousSyncRef.current = {
            sessionId: null,
            generatedWords: 0,
            lastCommittedAt: null,
          };
          if (hadTrackedSession) {
            await refreshProject();
          }
          return;
        }

        const session = await api.autonomous.get(sessionSummary.id);
        const previousSync = autonomousSyncRef.current;
        autonomousSyncRef.current = {
          sessionId: session.id,
          generatedWords: session.generatedWords,
          lastCommittedAt: session.lastCommittedAt || null,
        };

        const hasFreshCommit = Boolean(
          session.lastCommittedAt &&
          session.lastCommittedAt !== previousSync.lastCommittedAt &&
          !session.pendingDraft,
        );

        const hasVisibleWordChange = Boolean(
          !session.pendingDraft &&
          (session.generatedWords !== previousSync.generatedWords ||
            session.id !== previousSync.sessionId),
        );

        if (hasFreshCommit || hasVisibleWordChange) {
          await refreshProject();
        }
      } catch (error) {
        if (!cancelled) {
          console.error("Failed to sync background autonomous session:", error);
        }
      } finally {
        if (!cancelled) {
          if (autonomousSyncRef.current.sessionId) {
            pollTimer = setTimeout(() => {
              void pollAutonomousSessions();
            }, POLL_AUTONOMOUS_MS);
          } else {
            pollTimer = null;
          }
        }
      }
    };

    pollTimer = setTimeout(() => {
      void pollAutonomousSessions();
    }, INITIAL_AUTONOMOUS_POLL_MS);

    return (): void => {
      cancelled = true;
      if (pollTimer) {
        clearTimeout(pollTimer);
      }
    };
  }, [currentProject?.id, refreshProject, view]);

  const addChapter = async (): Promise<void> => {
    if (!currentProject) return;
    try {
      const chapter = await api.projects.createChapter(currentProject.id);
      const newProject = {
        ...currentProject,
        chapters: [...currentProject.chapters, chapter],
      };
      setCurrentProject(newProject);
      setCurrentChapter(chapter);
      setAppError(null);
    } catch (error) {
      setAppError(
        error instanceof Error ? error.message : "Failed to add chapter",
      );
    }
  };

  const deleteChapter = async (chapterId: string): Promise<void> => {
    if (!currentProject || currentProject.chapters.length <= 1) return;
    try {
      await api.projects.deleteChapter(currentProject.id, chapterId);
      const newChapters = currentProject.chapters.filter(
        (c) => c.id !== chapterId,
      );
      const newProject = { ...currentProject, chapters: newChapters };
      setCurrentProject(newProject);
      if (currentChapter?.id === chapterId) {
        setCurrentChapter(newChapters[0] || null);
      }
      setAppError(null);
    } catch (error) {
      setAppError(
        error instanceof Error ? error.message : "Failed to delete chapter",
      );
    }
  };

  if (serverStatus === "checking") {
    return (
      <div className="min-h-screen flex items-center justify-center px-6 bg-stone-50">
        <div className="bg-white rounded-xl shadow-xl w-full max-w-md text-center px-8 py-10 border border-stone-200">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-stone-300 bg-stone-100">
            <div className="animate-spin h-6 w-6 rounded-full border-2 border-stone-300 border-t-amber-500"></div>
          </div>
          <p className="text-lg font-semibold text-stone-800">
            Connecting to Magnum Opus
          </p>
          <p className="mt-2 text-sm text-stone-600">
            Checking the local writing engine and services.
          </p>
        </div>
      </div>
    );
  }

  if (serverStatus === "offline") {
    return (
      <div className="min-h-screen flex items-center justify-center px-6 bg-stone-50">
        <div className="bg-white rounded-xl shadow-xl max-w-md p-8 text-center border border-stone-200">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-amber-200 bg-amber-50 text-amber-700">
            !
          </div>
          <h1 className="mb-2 text-2xl font-bold text-stone-800">
            Server Offline
          </h1>
          <p className="mb-4 text-stone-600">
            The Magnum Opus server is not running. Start it with:
          </p>
          <code className="mb-4 block rounded-xl border border-stone-200 bg-stone-100 p-4 text-sm text-stone-800">
            npm run server
          </code>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-stone-800 text-white rounded-lg hover:bg-stone-700"
          >
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="magnum-app-shell min-h-screen relative">
      {showBackground && (
        <Suspense fallback={null}>
          <MagnumBackground className="absolute inset-0 z-0" />
        </Suspense>
      )}

      <nav className="relative z-20 px-6 pt-6">
        <div className="env-chrome mx-auto max-w-7xl rounded-xl border border-stone-200 px-6">
          <div className="flex min-h-[5rem] items-center justify-between gap-4 text-lg">
            <div className="flex min-w-0 flex-1 items-center gap-4">
              <div className="flex shrink-0 items-center gap-3">
                <div className="relative">
                  <div className="absolute h-3 w-3 rounded-full bg-amber-500 opacity-70 animate-ping"></div>
                  <div className="relative h-3 w-3 rounded-full bg-amber-500"></div>
                </div>

                <h1 className="text-2xl font-semibold tracking-wide text-stone-800">
                  Magnum Opus
                </h1>
                <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold tracking-[0.18em] text-amber-700">
                  AI
                </span>
              </div>
              <div className="flex min-w-0 flex-nowrap gap-1">
                <NavButton
                  active={view === "projects"}
                  onClick={() => setView("projects")}
                >
                  Projects
                </NavButton>
                {currentProject && (
                  <>
                    <NavButton
                      active={view === "editor"}
                      onClick={() => setView("editor")}
                    >
                      Editor
                    </NavButton>
                    <NavButton
                      active={view === "autonomous"}
                      onClick={() => setView("autonomous")}
                    >
                      Autonomous
                    </NavButton>
                    <NavButton
                      active={view === "story-bible"}
                      onClick={() => setView("story-bible")}
                    >
                      Story Bible
                    </NavButton>
                  </>
                )}
                <NavButton
                  active={view === "style"}
                  onClick={() => setView("style")}
                >
                  Style
                </NavButton>
                <NavButton
                  active={view === "metrics"}
                  onClick={() => setView("metrics")}
                >
                  Metrics
                </NavButton>
                <NavButton
                  active={view === "settings"}
                  onClick={() => setView("settings")}
                >
                  Settings
                </NavButton>
              </div>
            </div>
            {currentProject && (
              <div className="hidden shrink-0 items-center gap-3 text-sm xl:flex">
                <div className="env-pill inline-flex items-center rounded-full border border-stone-200 px-3 py-1.5">
                  <span className="text-stone-800">{currentProject.title}</span>
                  <span className="mx-2 text-stone-400">•</span>
                  <span className="font-medium text-amber-700">
                    {currentProject.wordCount.toLocaleString()}
                  </span>
                  <span className="ml-1 text-stone-600">words</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="relative z-10 px-6 pb-8 pt-6 text-lg">
        {appError && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {appError}
          </div>
        )}
        {view === "projects" && (
          <ProjectList
            projects={projects}
            isLoading={projectsLoading}
            onOpen={openProject}
            onCreate={createProject}
            onDelete={deleteProject}
          />
        )}
        {view === "editor" && currentProject && (
          <Suspense fallback={<ViewLoadingCard label="Loading editor" />}>
            <EditorView
              project={currentProject}
              chapter={currentChapter}
              chapters={currentProject.chapters}
              onChapterChange={setCurrentChapter}
              onChapterUpdate={updateChapter}
              onChapterLocalUpdate={updateChapterLocally}
              onAddChapter={addChapter}
              onDeleteChapter={deleteChapter}
              onProjectUpdate={updateProject}
            />
          </Suspense>
        )}
        {view === "autonomous" && currentProject && (
          <Suspense
            fallback={<ViewLoadingCard label="Loading autonomous writer" />}
          >
            <div className="mx-auto max-w-6xl p-2 md:p-6">
              <AutonomousWriterView
                project={currentProject}
                chapters={currentProject.chapters}
                onChapterUpdate={updateChapter}
                onRefreshProject={refreshProject}
                onWordsGenerated={(newTotal) => {
                  setCurrentProject((previous) =>
                    previous ? { ...previous, wordCount: newTotal } : previous,
                  );
                  setProjects((previous) =>
                    previous.map((project) =>
                      project.id === currentProject.id
                        ? { ...project, wordCount: newTotal }
                        : project,
                    ),
                  );
                }}
              />
            </div>
          </Suspense>
        )}
        {view === "story-bible" && currentProject && (
          <Suspense fallback={<ViewLoadingCard label="Loading story bible" />}>
            <StoryBibleView
              project={currentProject}
              onUpdate={(storyBible) => updateProject({ storyBible })}
            />
          </Suspense>
        )}
        {view === "style" && (
          <Suspense fallback={<ViewLoadingCard label="Loading style tools" />}>
            <StyleLearningView />
          </Suspense>
        )}
        {view === "metrics" && (
          <Suspense fallback={<ViewLoadingCard label="Loading metrics" />}>
            <MetricsDashboardView />
          </Suspense>
        )}
        {view === "settings" && (
          <Suspense fallback={<ViewLoadingCard label="Loading settings" />}>
            <SettingsView />
          </Suspense>
        )}
      </main>
    </div>
  );
}

function ViewLoadingCard({ label }: { label: string }): React.JSX.Element {
  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <div className="env-card rounded-xl border border-stone-200 px-6 py-8 text-sm text-stone-600">
        {label}...
      </div>
    </div>
  );
}

function NavButton({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
}): React.JSX.Element {
  return (
    <button
      onClick={() => {
        void playUiSound("tap");
        onClick();
      }}
      className={`env-nav-button relative overflow-visible whitespace-nowrap rounded-xl border px-3 py-2.5 text-[15px] transition-all duration-200 ${
        active
          ? "env-nav-button-active border-amber-300 text-amber-800 font-medium"
          : "env-nav-button-idle border-transparent text-stone-600 hover:text-stone-800"
      }`}
    >
      {children}
    </button>
  );
}
