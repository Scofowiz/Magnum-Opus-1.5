import { useState, useEffect, useRef, type JSX } from "react";
import { api } from "../api/client";
import type {
  Character,
  ChapterOutline,
  ExtractionMetrics,
  PlotThread,
  Project,
  StoryBible,
} from "../types/magnumOpus";

interface StoryBibleProps {
  project: Project;
  onUpdate: (storyBible: StoryBible) => void;
}

const DEFAULT_BIBLE: StoryBible = {
  premise: { logline: "", synopsis: "", themes: [], tone: "", genre: "" },
  characters: [],
  world: { setting: "", timePeriod: "", locations: [], rules: [] },
  plotStructure: { acts: [], plotThreads: [] },
  styleDirectives: {
    pov: "third-limited",
    tense: "past",
    proseStyle: "",
    dialogueStyle: "",
  },
  chapterOutlines: [],
};

const SAVE_DEBOUNCE_MS = 1000;
const MIN_SOURCE_CHARS = 50;
const MIN_SYNOPSIS_CHAPTERS = 3;
const MAX_SYNOPSIS_CHAPTERS = 50;

const stripMarkup = (text: string): string =>
  text
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const normalizeCommaSeparatedList = (text: string): string[] =>
  text
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
type CharacterCognitiveFilter = NonNullable<Character["cognitiveFilter"]>;
type EditableAct = NonNullable<StoryBible["plotStructure"]["acts"]>[number];

function sanitizeStoryBible(input?: StoryBible | null): StoryBible {
  const safe = input || DEFAULT_BIBLE;
  return {
    premise: {
      ...DEFAULT_BIBLE.premise,
      ...(safe.premise || {}),
      themes: Array.isArray(safe.premise?.themes)
        ? safe.premise.themes
        : DEFAULT_BIBLE.premise.themes,
    },
    characters: Array.isArray(safe.characters) ? safe.characters : [],
    world: {
      ...DEFAULT_BIBLE.world,
      ...(safe.world || {}),
      locations: Array.isArray(safe.world?.locations)
        ? safe.world.locations
        : [],
      rules: Array.isArray(safe.world?.rules) ? safe.world.rules : [],
    },
    plotStructure: {
      acts: Array.isArray(safe.plotStructure?.acts)
        ? safe.plotStructure.acts
        : [],
      plotThreads: Array.isArray(safe.plotStructure?.plotThreads)
        ? safe.plotStructure.plotThreads
        : [],
    },
    styleDirectives: {
      ...DEFAULT_BIBLE.styleDirectives,
      ...(safe.styleDirectives || {}),
    },
    chapterOutlines: Array.isArray(safe.chapterOutlines)
      ? safe.chapterOutlines
      : [],
  };
}

function CommaSeparatedInput({
  values = [],
  onCommit,
  placeholder,
  className,
}: {
  values?: string[];
  onCommit: (values: string[]) => void;
  placeholder?: string;
  className?: string;
}): JSX.Element {
  const [text, setText] = useState(values.join(", "));
  const previousValuesRef = useRef(values);

  // Only sync when values actually change from parent (not during typing)
  useEffect(() => {
    const valuesChanged =
      values.length !== previousValuesRef.current.length ||
      values.some((value, i) => value !== previousValuesRef.current[i]);

    if (valuesChanged) {
      previousValuesRef.current = values;
      setText(values.join(", "));
    }
  }, [values]);

  const handleTextChange = (value: string): void => {
    setText(value);
    // Save immediately instead of onBlur to prevent cursor issues
    const normalized = normalizeCommaSeparatedList(value);
    previousValuesRef.current = normalized;
    onCommit(normalized);
  };

  return (
    <input
      type="text"
      value={text}
      onChange={(e) => handleTextChange(e.target.value)}
      placeholder={placeholder}
      className={className}
    />
  );
}

function PlotThreadEditor({
  thread,
  characters,
  threads,
  onChange,
  onDelete,
}: {
  thread: PlotThread;
  characters: Character[];
  threads: PlotThread[];
  onChange: (thread: PlotThread) => void;
  onDelete: () => void;
}): JSX.Element {
  const [isExpanded, setIsExpanded] = useState(false);

  // Build chapter span display
  const chapterSpan = thread.introducedIn
    ? thread.resolvedIn
      ? `Ch. ${thread.introducedIn} → ${thread.resolvedIn}`
      : `Ch. ${thread.introducedIn} → ongoing`
    : null;

  return (
    <div className="p-4 bg-stone-50 rounded-lg border border-stone-200">
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <input
              type="text"
              value={thread.name}
              onChange={(e) => onChange({ ...thread, name: e.target.value })}
              className="font-medium bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-stone-300 rounded px-1 flex-1"
              placeholder="Thread name"
            />
            {chapterSpan && (
              <span className="text-xs px-2 py-0.5 bg-purple-100 text-purple-700 rounded whitespace-nowrap">
                {chapterSpan}
              </span>
            )}
          </div>
        </div>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-stone-500 hover:text-stone-700 text-sm ml-2"
        >
          {isExpanded ? "▼" : "▶"}
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-2">
        <select
          value={thread.type}
          onChange={(e) => onChange({ ...thread, type: e.target.value })}
          className="text-sm p-1 border border-stone-300 rounded"
        >
          <option value="main">Main</option>
          <option value="subplot">Subplot</option>
          <option value="character-arc">Character Arc</option>
          <option value="mystery">Mystery</option>
          <option value="romance">Romance</option>
          <option value="conflict">Conflict</option>
        </select>

        <select
          value={thread.status}
          onChange={(e) => onChange({ ...thread, status: e.target.value })}
          className="text-sm p-1 border border-stone-300 rounded"
        >
          <option value="setup">Setup</option>
          <option value="active">Active</option>
          <option value="dormant">Dormant</option>
          <option value="resolved">Resolved</option>
        </select>

        <select
          value={thread.tension || "medium"}
          onChange={(e) =>
            onChange({
              ...thread,
              tension: e.target.value as PlotThread["tension"],
            })
          }
          className="text-sm p-1 border border-stone-300 rounded"
        >
          <option value="low">Low Tension</option>
          <option value="medium">Medium Tension</option>
          <option value="high">High Tension</option>
          <option value="critical">Critical Tension</option>
        </select>
      </div>

      <textarea
        value={thread.description}
        onChange={(e) => onChange({ ...thread, description: e.target.value })}
        className="text-sm w-full p-2 border border-stone-300 rounded resize-none"
        rows={2}
        placeholder="Brief description of this plot thread..."
      />

      {isExpanded && (
        <div className="mt-3 space-y-3 pt-3 border-t border-stone-300">
          <div>
            <label className="text-xs font-medium text-stone-700 block mb-1">
              Current State
            </label>
            <textarea
              value={thread.currentState || ""}
              onChange={(e) =>
                onChange({ ...thread, currentState: e.target.value })
              }
              className="text-sm w-full p-2 border border-stone-300 rounded resize-none"
              rows={2}
              placeholder="Where does this thread stand right now?"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-stone-700 block mb-1">
              Next Milestone
            </label>
            <input
              type="text"
              value={thread.nextMilestone || ""}
              onChange={(e) =>
                onChange({ ...thread, nextMilestone: e.target.value })
              }
              className="text-sm w-full p-2 border border-stone-300 rounded"
              placeholder="What needs to happen next?"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-stone-700 block mb-1">
                Introduced In (Ch.)
              </label>
              <input
                type="number"
                value={thread.introducedIn || ""}
                onChange={(e) =>
                  onChange({
                    ...thread,
                    introducedIn: e.target.value
                      ? parseInt(e.target.value)
                      : undefined,
                  })
                }
                className="text-sm w-full p-2 border border-stone-300 rounded"
                placeholder="Chapter #"
                min="1"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-stone-700 block mb-1">
                Resolved In (Ch.)
              </label>
              <input
                type="number"
                value={thread.resolvedIn || ""}
                onChange={(e) =>
                  onChange({
                    ...thread,
                    resolvedIn: e.target.value
                      ? parseInt(e.target.value)
                      : undefined,
                  })
                }
                className="text-sm w-full p-2 border border-stone-300 rounded"
                placeholder="Chapter #"
                min="1"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-stone-700 block mb-1">
              Key Characters
            </label>
            <div className="flex flex-wrap gap-1 mb-2">
              {(thread.keyCharacters || []).map((char, i) => (
                <span
                  key={i}
                  className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded flex items-center gap-1"
                >
                  {char}
                  <button
                    onClick={() => {
                      onChange({
                        ...thread,
                        keyCharacters: thread.keyCharacters?.filter(
                          (_, idx) => idx !== i,
                        ),
                      });
                    }}
                    className="text-blue-500 hover:text-blue-700"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <select
              onChange={(e) => {
                if (
                  e.target.value &&
                  !(thread.keyCharacters || []).includes(e.target.value)
                ) {
                  onChange({
                    ...thread,
                    keyCharacters: [
                      ...(thread.keyCharacters || []),
                      e.target.value,
                    ],
                  });
                  e.target.value = "";
                }
              }}
              className="text-sm w-full p-2 border border-stone-300 rounded"
            >
              <option value="">Add character...</option>
              {characters
                .filter((c) => !(thread.keyCharacters || []).includes(c.name))
                .map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name}
                  </option>
                ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-stone-700 block mb-1">
              Related Threads
            </label>
            <div className="flex flex-wrap gap-1 mb-2">
              {(thread.relatedThreads || []).map((relId, i) => {
                const relThread = threads.find((t) => t.id === relId);
                return relThread ? (
                  <span
                    key={i}
                    className="text-xs px-2 py-1 bg-amber-100 text-amber-700 rounded flex items-center gap-1"
                  >
                    {relThread.name}
                    <button
                      onClick={() => {
                        onChange({
                          ...thread,
                          relatedThreads: thread.relatedThreads?.filter(
                            (_, idx) => idx !== i,
                          ),
                        });
                      }}
                      className="text-amber-500 hover:text-amber-700"
                    >
                      ×
                    </button>
                  </span>
                ) : null;
              })}
            </div>
            <select
              onChange={(e) => {
                if (
                  e.target.value &&
                  e.target.value !== thread.id &&
                  !(thread.relatedThreads || []).includes(e.target.value)
                ) {
                  onChange({
                    ...thread,
                    relatedThreads: [
                      ...(thread.relatedThreads || []),
                      e.target.value,
                    ],
                  });
                  e.target.value = "";
                }
              }}
              className="text-sm w-full p-2 border border-stone-300 rounded"
            >
              <option value="">Link to thread...</option>
              {threads
                .filter(
                  (t) =>
                    t.id !== thread.id &&
                    !(thread.relatedThreads || []).includes(t.id),
                )
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-stone-700 block mb-1">
              Plot Beats
            </label>
            {(thread.beats || []).map((beat, i) => (
              <div key={i} className="flex gap-1 mb-1">
                <input
                  type="text"
                  value={beat}
                  onChange={(e) => {
                    const newBeats = [...(thread.beats || [])];
                    newBeats[i] = e.target.value;
                    onChange({ ...thread, beats: newBeats });
                  }}
                  className="text-sm flex-1 p-2 border border-stone-300 rounded"
                  placeholder={`Beat ${i + 1}`}
                />
                <button
                  onClick={() => {
                    onChange({
                      ...thread,
                      beats: thread.beats?.filter((_, idx) => idx !== i),
                    });
                  }}
                  className="px-2 text-stone-500 hover:text-red-600"
                >
                  ×
                </button>
              </div>
            ))}
            <button
              onClick={() => {
                // Filter out empty beats before adding new one
                const cleanedBeats = (thread.beats || []).filter(
                  (b) => b.trim() !== "",
                );
                onChange({ ...thread, beats: [...cleanedBeats, ""] });
              }}
              className="text-xs px-2 py-1 border border-stone-300 rounded text-stone-600 hover:bg-stone-100"
            >
              + Add Beat
            </button>
          </div>

          <button
            onClick={onDelete}
            className="w-full py-2 text-sm text-red-600 border border-red-300 rounded hover:bg-red-50"
          >
            Delete Thread
          </button>
        </div>
      )}
    </div>
  );
}

export function StoryBible({
  project,
  onUpdate,
}: StoryBibleProps): JSX.Element {
  const [activeTab, setActiveTab] = useState<
    "premise" | "characters" | "world" | "plot" | "chapters" | "style"
  >("premise");
  const [isExtracting, setIsExtracting] = useState(false);
  const [isIterativeExtracting, setIsIterativeExtracting] = useState(false);
  const [extractionPass, setExtractionPass] = useState<string | null>(null);
  const [extractionMetrics, setExtractionMetrics] =
    useState<ExtractionMetrics | null>(null);
  const [extractError, setExtractError] = useState<string | null>(null);
  // Synopsis expansion state
  const [isExpandingSynopsis, setIsExpandingSynopsis] = useState(false);
  const [synopsisText, setSynopsisText] = useState("");
  const [synopsisTargetChapters, setSynopsisTargetChapters] = useState(10);
  const [synopsisTargetChaptersInput, setSynopsisTargetChaptersInput] =
    useState("10");
  const [proposedChapterStructure, setProposedChapterStructure] = useState<{
    chapterOutlines: ChapterOutline[];
    storyNotes: string;
    isSuggestion: boolean;
  } | null>(null);
  const [expandSynopsisError, setExpandSynopsisError] = useState<string | null>(
    null,
  );
  const [saveStatus, setSaveStatus] = useState<
    "saved" | "saving" | "unsaved" | "error"
  >("saved");
  const isMountedRef = useRef(true);

  // Local state for editing - prevents input lag from API calls
  const [bible, setBible] = useState<StoryBible>(
    sanitizeStoryBible(project.storyBible),
  );
  const saveTimeoutRef = useRef<NodeJS.Timeout>();
  const lastProjectIdRef = useRef(project.id);
  const lastExternalBibleRef = useRef(
    JSON.stringify(sanitizeStoryBible(project.storyBible)),
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
    };
  }, []);

  const normalizeSynopsisChapterCount = (value: string | number): number => {
    const parsed =
      typeof value === "number" ? value : parseInt(value.trim(), 10);
    if (!Number.isFinite(parsed)) return synopsisTargetChapters;
    return Math.max(
      MIN_SYNOPSIS_CHAPTERS,
      Math.min(MAX_SYNOPSIS_CHAPTERS, parsed),
    );
  };

  const commitSynopsisChapterCount = (value: string): number => {
    const normalized = normalizeSynopsisChapterCount(value);
    setSynopsisTargetChapters(normalized);
    setSynopsisTargetChaptersInput(String(normalized));
    return normalized;
  };

  // Only sync from server when the external story bible actually changes.
  useEffect(() => {
    const nextBible = sanitizeStoryBible(project.storyBible);
    const nextSerialized = JSON.stringify(nextBible);
    const projectChanged = project.id !== lastProjectIdRef.current;
    const externalChanged = nextSerialized !== lastExternalBibleRef.current;

    if (!projectChanged && !externalChanged) {
      return;
    }

    lastProjectIdRef.current = project.id;
    lastExternalBibleRef.current = nextSerialized;
    if (isMountedRef.current) {
      setBible(nextBible);
    }
  }, [project.id, project.storyBible]);

  const updateBible = (updates: Partial<StoryBible>): void => {
    const newBible = sanitizeStoryBible({ ...bible, ...updates });
    setBible(newBible);
    setSaveStatus("unsaved");

    // Debounce save to server
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(async () => {
      if (isMountedRef.current) setSaveStatus("saving");
      try {
        await onUpdate(newBible);
        if (isMountedRef.current) setSaveStatus("saved");
      } catch (e) {
        if (isMountedRef.current) setSaveStatus("error");
        console.error("Failed to save Story Bible:", e);
      }
    }, SAVE_DEBOUNCE_MS);
  };

  const extractFromText = async (): Promise<void> => {
    const chapterSource = project.chapters
      .map((chapter) => stripMarkup(chapter.content || ""))
      .join(" ")
      .trim();
    const fallbackSource = stripMarkup(project.content || "");
    if ((chapterSource || fallbackSource).length < MIN_SOURCE_CHARS) {
      setExtractError("Need some story content to extract a Story Bible");
      return;
    }

    if (isMountedRef.current) {
      setIsExtracting(true);
      setExtractError(null);
      setExtractionMetrics(null);
    }

    try {
      const extracted = await api.projects.extractStoryBible(project.id, {});
      if (isMountedRef.current) {
        const sanitized = sanitizeStoryBible(extracted);
        setBible(sanitized);
        onUpdate(sanitized);
      }
    } catch (e) {
      if (isMountedRef.current) setExtractError(String(e));
    } finally {
      if (isMountedRef.current) setIsExtracting(false);
    }
  };

  const extractIterative = async (): Promise<void> => {
    const chapterSource = project.chapters
      .map((chapter) => stripMarkup(chapter.content || ""))
      .join(" ")
      .trim();
    const fallbackSource = stripMarkup(project.content || "");
    if ((chapterSource || fallbackSource).length < MIN_SOURCE_CHARS) {
      setExtractError("Need some story content to extract");
      return;
    }

    if (isMountedRef.current) {
      setIsIterativeExtracting(true);
      setExtractError(null);
      setExtractionMetrics(null);
      setExtractionPass("Starting character extraction...");
    }

    try {
      if (isMountedRef.current) {
        setExtractionPass("Extracting and enriching characters...");
      }
      const { storyBible, extractionMetrics: metrics } =
        await api.projects.extractStoryBibleIterative(project.id, {
          enrichExisting: true,
        });
      if (isMountedRef.current) {
        const sanitized = sanitizeStoryBible(storyBible);
        setBible(sanitized);
        onUpdate(sanitized);
        setExtractionMetrics(metrics);
        setExtractionPass(null);
      }
    } catch (e) {
      if (isMountedRef.current) setExtractError(String(e));
    } finally {
      if (isMountedRef.current) {
        setIsIterativeExtracting(false);
        setExtractionPass(null);
      }
    }
  };

  return (
    <div className="story-bible-shell max-w-6xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-stone-800">Story Bible</h1>
          <p className="text-stone-600 mt-1">
            Define your story's characters, world, and rules
            <span
              className={`ml-3 text-sm inline-block w-24 ${
                saveStatus === "saved"
                  ? "text-green-600"
                  : saveStatus === "error"
                    ? "text-red-600"
                    : "text-stone-400"
              }`}
            >
              {saveStatus === "saved"
                ? "• Saved"
                : saveStatus === "saving"
                  ? "• Saving..."
                  : saveStatus === "error"
                    ? "• Save failed"
                    : "• Unsaved"}
            </span>
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => {
              const data = JSON.stringify(bible, null, 2);
              const blob = new Blob([data], { type: "application/json" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `${project.title.replace(/[^a-z0-9]/gi, "_")}_story_bible.json`;
              a.click();
              URL.revokeObjectURL(url);
            }}
            className="px-4 py-3 border-2 border-amber-500 text-amber-700 rounded-lg hover:bg-amber-50 font-medium"
          >
            Export Bible
          </button>
          <label className="px-4 py-3 border-2 border-purple-500 text-purple-700 rounded-lg hover:bg-purple-50 font-medium cursor-pointer">
            Import Bible
            <input
              type="file"
              accept=".json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (event): void => {
                  try {
                    const raw = (event.target?.result as string).trim();
                    let imported: StoryBible;
                    try {
                      imported = JSON.parse(raw) as StoryBible;
                    } catch {
                      // Handle multiple concatenated JSON objects — track strings to ignore braces inside them
                      const objects: StoryBible[] = [];
                      let depth = 0,
                        start = -1,
                        inStr = false,
                        esc = false;
                      for (let i = 0; i < raw.length; i++) {
                        const ch = raw[i];
                        if (esc) {
                          esc = false;
                          continue;
                        }
                        if (ch === "\\" && inStr) {
                          esc = true;
                          continue;
                        }
                        if (ch === '"') {
                          inStr = !inStr;
                          continue;
                        }
                        if (inStr) continue;
                        if (ch === "{") {
                          if (depth === 0) start = i;
                          depth++;
                        } else if (ch === "}") {
                          depth--;
                          if (depth === 0 && start >= 0) {
                            try {
                              objects.push(
                                JSON.parse(
                                  raw.slice(start, i + 1),
                                ) as StoryBible,
                              );
                            } catch {
                              // Ignore malformed fragments inside concatenated exports.
                            }
                            start = -1;
                          }
                        }
                      }
                      if (objects.length >= 2) {
                        imported = Object.assign({}, ...objects) as StoryBible;
                      } else if (objects.length === 1) {
                        imported = objects[0];
                      } else {
                        throw new Error("No valid JSON objects found");
                      }
                    }
                    const sanitized = sanitizeStoryBible(imported);
                    setBible(sanitized);
                    onUpdate(sanitized);
                    setSaveStatus("saved");
                  } catch {
                    setExtractError("Invalid JSON file");
                  }
                };
                reader.readAsText(file);
                e.target.value = "";
              }}
            />
          </label>
          <button
            onClick={() => {
              const blankBible = {
                premise: {
                  logline: "",
                  synopsis: "",
                  themes: [],
                  tone: "",
                  genre: "",
                },
                characters: [],
                world: {
                  setting: "",
                  timePeriod: "",
                  locations: [],
                  rules: [],
                },
                plotStructure: { acts: [], plotThreads: [] },
                chapterOutlines: [],
                styleDirectives: {
                  pov: "",
                  tense: "",
                  proseStyle: "",
                  dialogueStyle: "",
                },
              };
              const sanitized = sanitizeStoryBible(blankBible);
              setBible(sanitized);
              onUpdate(sanitized);
            }}
            className="px-6 py-3 bg-stone-600 text-white rounded-lg hover:bg-stone-700 font-medium"
          >
            Start Fresh
          </button>
          <button
            onClick={extractFromText}
            disabled={isExtracting || isIterativeExtracting}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium min-w-44"
          >
            {isExtracting ? "Extracting..." : "Extract from Project"}
          </button>
          <label className="px-6 py-3 bg-amber-600 text-white rounded-lg hover:bg-amber-700 font-medium cursor-pointer min-w-40 text-center inline-block">
            {isExtracting ? "Extracting..." : "Extract from File"}
            <input
              type="file"
              accept=".txt,.md"
              className="hidden"
              disabled={isExtracting || isIterativeExtracting}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;

                const reader = new FileReader();
                reader.onload = async (event): Promise<void> => {
                  const text = event.target?.result as string;
                  if (!text || text.length < MIN_SOURCE_CHARS) {
                    setExtractError("File needs some content");
                    return;
                  }

                  setIsExtracting(true);
                  setExtractError(null);

                  try {
                    const extracted = await api.projects.extractStoryBible(
                      project.id,
                      { text },
                    );
                    setBible(extracted);
                    onUpdate(extracted);
                  } catch (err) {
                    setExtractError(String(err));
                  } finally {
                    setIsExtracting(false);
                  }
                };
                reader.readAsText(file);
                e.target.value = "";
              }}
            />
          </label>
          <button
            onClick={extractIterative}
            disabled={isExtracting || isIterativeExtracting}
            className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 font-medium min-w-44"
          >
            {isIterativeExtracting
              ? extractionPass || "Extracting..."
              : "Iterative Characters"}
          </button>
        </div>
      </div>

      {/* Synopsis Expansion Section */}
      <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <h3 className="font-semibold text-blue-800 mb-2">
          Generate Chapter Structure from Synopsis
        </h3>
        <p className="text-sm text-blue-600 mb-3">
          Have an idea but no chapters yet? Paste your synopsis or brain dump
          below and I'll suggest a chapter structure for you to review.
        </p>
        <textarea
          value={synopsisText}
          onChange={(e) => setSynopsisText(e.target.value)}
          placeholder="Paste your story synopsis, plot summary, or brain dump here (minimum 100 characters)..."
          rows={5}
          className="w-full px-3 py-2 border border-blue-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 mb-3"
        />
        <div className="flex items-center gap-4 mb-3">
          <label className="text-sm text-blue-700">
            Target chapters:
            <input
              type="number"
              min={MIN_SYNOPSIS_CHAPTERS}
              max={MAX_SYNOPSIS_CHAPTERS}
              value={synopsisTargetChaptersInput}
              onChange={(e) => setSynopsisTargetChaptersInput(e.target.value)}
              onBlur={(e) => {
                if (!e.target.value.trim()) {
                  setSynopsisTargetChaptersInput(
                    String(synopsisTargetChapters),
                  );
                  return;
                }
                commitSynopsisChapterCount(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitSynopsisChapterCount(
                    (e.target as HTMLInputElement).value,
                  );
                  (e.target as HTMLInputElement).blur();
                }
              }}
              className="ml-2 w-16 px-2 py-1 border border-blue-300 rounded text-sm"
            />
          </label>
          <button
            onClick={async () => {
              if (synopsisText.trim().length < 100) {
                setExpandSynopsisError(
                  "Please enter at least 100 characters of synopsis text",
                );
                return;
              }
              setIsExpandingSynopsis(true);
              setExpandSynopsisError(null);
              setProposedChapterStructure(null);
              try {
                const targetChapters = commitSynopsisChapterCount(
                  synopsisTargetChaptersInput,
                );
                const result = await api.projects.expandSynopsis(project.id, {
                  synopsis: synopsisText,
                  targetChapters,
                });
                setProposedChapterStructure(result);
              } catch (err) {
                setExpandSynopsisError(String(err));
              } finally {
                setIsExpandingSynopsis(false);
              }
            }}
            disabled={isExpandingSynopsis || synopsisText.trim().length < 100}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
          >
            {isExpandingSynopsis
              ? "Generating..."
              : "Suggest Chapter Structure"}
          </button>
        </div>
        {expandSynopsisError && (
          <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm mb-3">
            {expandSynopsisError}
          </div>
        )}

        {/* Proposed Chapter Structure Preview */}
        {proposedChapterStructure && (
          <div className="mt-4 p-4 bg-white border border-blue-300 rounded-lg">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-semibold text-blue-800">
                Suggested Chapter Structure (
                {proposedChapterStructure.chapterOutlines.length} chapters)
              </h4>
              <span className="text-xs text-blue-500 bg-blue-100 px-2 py-1 rounded">
                Review & Accept
              </span>
            </div>
            {proposedChapterStructure.storyNotes && (
              <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded text-sm text-amber-800">
                <strong>Notes:</strong> {proposedChapterStructure.storyNotes}
              </div>
            )}
            <div className="space-y-3 max-h-80 overflow-y-auto mb-4">
              {proposedChapterStructure.chapterOutlines.map((outline) => (
                <div
                  key={outline.chapterNumber}
                  className="p-3 bg-stone-50 border border-stone-200 rounded"
                >
                  <div className="flex items-start gap-2 mb-1">
                    <span className="text-xs font-bold text-blue-600 bg-blue-100 px-2 py-0.5 rounded">
                      Ch. {outline.chapterNumber}
                    </span>
                    <span className="font-medium text-stone-800">
                      {outline.title}
                    </span>
                  </div>
                  <p className="text-sm text-stone-600 mb-2">
                    {outline.summary}
                  </p>
                  {outline.beats && outline.beats.length > 0 && (
                    <div className="text-xs text-stone-500">
                      <strong>Beats:</strong>{" "}
                      {outline.beats.slice(0, 5).join(" → ")}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  // Accept the proposed structure
                  const currentBible = bible;
                  const outlinesByNumber = new Map<number, ChapterOutline>();
                  for (const outline of currentBible.chapterOutlines || []) {
                    outlinesByNumber.set(outline.chapterNumber, outline);
                  }
                  for (const outline of proposedChapterStructure.chapterOutlines) {
                    outlinesByNumber.set(outline.chapterNumber, outline);
                  }
                  const updatedBible = {
                    ...currentBible,
                    chapterOutlines: Array.from(outlinesByNumber.values()).sort(
                      (a, b) => a.chapterNumber - b.chapterNumber,
                    ),
                  };
                  setBible(updatedBible);
                  onUpdate(updatedBible);
                  setProposedChapterStructure(null);
                  setSynopsisText("");
                }}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium"
              >
                Accept Structure
              </button>
              <button
                onClick={() => setProposedChapterStructure(null)}
                className="px-4 py-2 bg-stone-200 text-stone-700 rounded-lg hover:bg-stone-300 text-sm"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="min-h-16 mb-2">
        {extractError && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            {extractError}
          </div>
        )}
      </div>

      {extractionMetrics && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
          <h3 className="font-semibold text-green-800 mb-3">
            Extraction Complete
          </h3>
          <div className="grid grid-cols-4 gap-4 mb-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-green-700">
                {extractionMetrics.totalCharactersFound}
              </div>
              <div className="text-sm text-green-600">Found</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-700">
                {extractionMetrics.totalNewAdded}
              </div>
              <div className="text-sm text-blue-600">New Added</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-yellow-700">
                {extractionMetrics.totalEnriched}
              </div>
              <div className="text-sm text-yellow-600">Enriched</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-stone-500">
                {extractionMetrics.totalDuplicatesSkipped}
              </div>
              <div className="text-sm text-stone-500">Skipped</div>
            </div>
          </div>
          <div className="space-y-2">
            {extractionMetrics.passBreakdown.map((pass) => (
              <div
                key={pass.pass}
                className="flex items-center justify-between text-sm bg-white p-2 rounded"
              >
                <span className="font-medium">
                  Pass {pass.pass}: {pass.name}
                </span>
                <span className="text-stone-600">
                  {pass.found} found, {pass.newAdded} new, {pass.enriched}{" "}
                  enriched
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="story-bible-tabs flex gap-2 mb-6 border-b border-stone-200">
        {(
          [
            "premise",
            "characters",
            "world",
            "plot",
            "chapters",
            "style",
          ] as const
        ).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-3 font-medium capitalize border-b-2 -mb-px ${
              activeTab === tab
                ? "border-stone-800 text-stone-800"
                : "border-transparent text-stone-500 hover:text-stone-700"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="story-bible-panel env-card rounded-xl border border-stone-200 p-6">
        {activeTab === "premise" && (
          <PremiseTab
            premise={bible.premise}
            onChange={(premise) => updateBible({ premise })}
          />
        )}
        {activeTab === "characters" && (
          <CharactersTab
            characters={bible.characters}
            onChange={(characters) => updateBible({ characters })}
            projectId={project.id}
          />
        )}
        {activeTab === "world" && (
          <WorldTab
            world={bible.world}
            onChange={(world) => updateBible({ world })}
          />
        )}
        {activeTab === "plot" && (
          <PlotTab
            plotStructure={bible.plotStructure}
            characters={bible.characters}
            onChange={(plotStructure) => updateBible({ plotStructure })}
          />
        )}
        {activeTab === "chapters" && (
          <ChapterOutlinesTab
            chapterOutlines={bible.chapterOutlines || []}
            onChange={(chapterOutlines) => updateBible({ chapterOutlines })}
          />
        )}
        {activeTab === "style" && (
          <StyleTab
            styleDirectives={bible.styleDirectives}
            onChange={(styleDirectives) => updateBible({ styleDirectives })}
          />
        )}
      </div>
    </div>
  );
}

function PremiseTab({
  premise,
  onChange,
}: {
  premise: StoryBible["premise"];
  onChange: (p: StoryBible["premise"]) => void;
}): JSX.Element {
  const [themesInput, setThemesInput] = useState(premise.themes.join(", "));
  const previousThemesRef = useRef(premise.themes);

  // Fixed: Only sync when themes length or content actually changes (not just on every keystroke)
  useEffect(() => {
    const themesChanged =
      premise.themes.length !== previousThemesRef.current.length ||
      premise.themes.some((theme, i) => theme !== previousThemesRef.current[i]);

    if (themesChanged) {
      previousThemesRef.current = premise.themes;
      setThemesInput(premise.themes.join(", "));
    }
  }, [premise.themes]);

  const handleThemesChange = (value: string): void => {
    setThemesInput(value);
    // Immediate save instead of onBlur to prevent cursor jumping
    const themes = value
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    previousThemesRef.current = themes;
    onChange({ ...premise, themes });
  };

  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">
          Logline
        </label>
        <input
          type="text"
          value={premise.logline}
          onChange={(e) => onChange({ ...premise, logline: e.target.value })}
          placeholder="A one-sentence summary of your story..."
          className="w-full px-4 py-2 border border-stone-300 rounded-lg"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">
          Synopsis
        </label>
        <textarea
          value={premise.synopsis}
          onChange={(e) => onChange({ ...premise, synopsis: e.target.value })}
          placeholder="A 2-3 paragraph summary of your story..."
          rows={6}
          className="w-full px-4 py-2 border border-stone-300 rounded-lg"
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1">
            Genre
          </label>
          <input
            type="text"
            value={premise.genre}
            onChange={(e) => onChange({ ...premise, genre: e.target.value })}
            placeholder="e.g., Dark Fantasy"
            className="w-full px-4 py-2 border border-stone-300 rounded-lg"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1">
            Tone
          </label>
          <input
            type="text"
            value={premise.tone}
            onChange={(e) => onChange({ ...premise, tone: e.target.value })}
            placeholder="e.g., Darkly humorous, Suspenseful"
            className="w-full px-4 py-2 border border-stone-300 rounded-lg"
          />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">
          Themes (comma-separated)
        </label>
        <input
          type="text"
          value={themesInput}
          onChange={(e) => handleThemesChange(e.target.value)}
          placeholder="e.g., Redemption, Power, Identity"
          className="w-full px-4 py-2 border border-stone-300 rounded-lg"
        />
      </div>
    </div>
  );
}

function CharactersTab({
  characters,
  onChange,
  projectId,
}: {
  characters: Character[];
  onChange: (c: Character[]) => void;
  projectId: string;
}): JSX.Element {
  const [editingId, setEditingId] = useState<string | null>(null);

  const addCharacter = async (): Promise<void> => {
    const char = await api.projects.createCharacter(projectId, {
      name: "New Character",
    });
    onChange([...characters, char]);
    setEditingId(char.id);
  };

  const updateCharacter = (id: string, updates: Partial<Character>): void => {
    onChange(characters.map((c) => (c.id === id ? { ...c, ...updates } : c)));
  };

  const deleteCharacter = (id: string): void => {
    onChange(characters.filter((c) => c.id !== id));
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-semibold text-stone-800">
          Characters ({characters.length})
        </h3>
        <button
          onClick={addCharacter}
          className="px-4 py-2 bg-stone-800 text-white rounded-lg text-sm"
        >
          + Add Character
        </button>
      </div>

      {characters.length === 0 ? (
        <p className="text-stone-500 text-center py-8">
          No characters yet. Add one to get started.
        </p>
      ) : (
        <div className="space-y-4">
          {characters.map((char) => (
            <div
              key={char.id}
              className="border border-stone-200 rounded-lg p-4"
            >
              {editingId === char.id ? (
                <CharacterEditor
                  character={char}
                  onChange={(updates) => updateCharacter(char.id, updates)}
                  onClose={() => setEditingId(null)}
                  onDelete={() => deleteCharacter(char.id)}
                />
              ) : (
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-semibold text-stone-800">
                        {char.name}
                      </h4>
                      {char.cognitiveFilter && (
                        <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-xs font-medium">
                          {char.cognitiveFilter.primaryMode}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-stone-500 capitalize">
                      {char.role}
                    </p>
                    <p className="text-sm text-stone-600 mt-1">
                      {char.description?.slice(0, 100)}
                      {char.description && char.description.length > 100
                        ? "..."
                        : ""}
                    </p>
                  </div>
                  <button
                    onClick={() => setEditingId(char.id)}
                    className="px-3 py-1 border rounded text-sm"
                  >
                    Edit
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CharacterEditor({
  character,
  onChange,
  onClose,
  onDelete,
}: {
  character: Character;
  onChange: (updates: Partial<Character>) => void;
  onClose: () => void;
  onDelete: () => void;
}): JSX.Element {
  const [showCognitiveFilter, setShowCognitiveFilter] = useState(
    !!character.cognitiveFilter,
  );

  const updateCognitiveFilter = <K extends keyof CharacterCognitiveFilter>(
    field: K,
    value: CharacterCognitiveFilter[K],
  ): void => {
    const current: CharacterCognitiveFilter = character.cognitiveFilter || {
      primaryMode: "analytical" as const,
      internalLanguage: "",
      blindSpot: "",
      repeatingThoughtLoop: "",
      forbiddenWords: [],
      signatureThoughts: [],
    };
    onChange({ cognitiveFilter: { ...current, [field]: value } });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1">
            Name
          </label>
          <input
            type="text"
            value={character.name}
            onChange={(e) => onChange({ name: e.target.value })}
            className="w-full px-3 py-2 border border-stone-300 rounded"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1">
            Role
          </label>
          <select
            value={character.role}
            onChange={(e) => onChange({ role: e.target.value })}
            className="w-full px-3 py-2 border border-stone-300 rounded"
          >
            <option value="protagonist">Protagonist</option>
            <option value="antagonist">Antagonist</option>
            <option value="supporting">Supporting</option>
            <option value="minor">Minor</option>
          </select>
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">
          Description
        </label>
        <textarea
          value={character.description}
          onChange={(e) => onChange({ description: e.target.value })}
          rows={2}
          className="w-full px-3 py-2 border border-stone-300 rounded"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">
          Backstory
        </label>
        <textarea
          value={character.backstory}
          onChange={(e) => onChange({ backstory: e.target.value })}
          rows={2}
          className="w-full px-3 py-2 border border-stone-300 rounded"
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1">
            Motivation
          </label>
          <input
            type="text"
            value={character.motivation}
            onChange={(e) => onChange({ motivation: e.target.value })}
            className="w-full px-3 py-2 border border-stone-300 rounded"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1">
            Flaw
          </label>
          <input
            type="text"
            value={character.flaw}
            onChange={(e) => onChange({ flaw: e.target.value })}
            className="w-full px-3 py-2 border border-stone-300 rounded"
          />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">
          Character Arc
        </label>
        <textarea
          value={character.arc}
          onChange={(e) => onChange({ arc: e.target.value })}
          rows={2}
          className="w-full px-3 py-2 border border-stone-300 rounded"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">
          Fears (comma-separated)
        </label>
        <CommaSeparatedInput
          values={character.fears}
          onCommit={(fears) => onChange({ fears })}
          placeholder="e.g., Abandonment, Failure, Heights"
          className="w-full px-3 py-2 border border-stone-300 rounded"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">
          Vocabulary Style
        </label>
        <input
          type="text"
          value={character.voice?.vocabulary || ""}
          onChange={(e) =>
            onChange({
              voice: { ...character.voice, vocabulary: e.target.value },
            })
          }
          placeholder="e.g., Academic, Street slang, Military jargon"
          className="w-full px-3 py-2 border border-stone-300 rounded"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">
          Speech Patterns (comma-separated)
        </label>
        <CommaSeparatedInput
          values={character.voice?.speechPatterns}
          onCommit={(speechPatterns) =>
            onChange({ voice: { ...character.voice, speechPatterns } })
          }
          placeholder="e.g., Uses formal language, Tends to ramble, Short sentences"
          className="w-full px-3 py-2 border border-stone-300 rounded"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">
          Catchphrases (comma-separated)
        </label>
        <CommaSeparatedInput
          values={character.voice?.catchphrases}
          onCommit={(catchphrases) =>
            onChange({ voice: { ...character.voice, catchphrases } })
          }
          placeholder="e.g., Trust me on this, What a mess, Here we go again"
          className="w-full px-3 py-2 border border-stone-300 rounded"
        />
      </div>

      {/* Cognitive Filter Section */}
      <div className="border-t border-stone-200 pt-4 mt-4">
        <button
          type="button"
          onClick={() => setShowCognitiveFilter(!showCognitiveFilter)}
          className="flex items-center gap-2 text-sm font-medium text-purple-700 hover:text-purple-800"
        >
          <span>{showCognitiveFilter ? "▼" : "▶"}</span>
          Cognitive Filter (Internal Voice)
          {character.cognitiveFilter && (
            <span className="text-green-600 text-xs ml-2">● Configured</span>
          )}
        </button>
        <p className="text-xs text-stone-500 mt-1">
          Define how this character thinks internally — affects POV narration
          and internal monologue.
        </p>

        {showCognitiveFilter && (
          <div className="mt-4 space-y-4 pl-4 border-l-2 border-purple-200">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1">
                  Primary Thinking Mode
                </label>
                <select
                  value={character.cognitiveFilter?.primaryMode || "analytical"}
                  onChange={(e) =>
                    updateCognitiveFilter(
                      "primaryMode",
                      e.target.value as CharacterCognitiveFilter["primaryMode"],
                    )
                  }
                  className="w-full px-3 py-2 border border-stone-300 rounded text-sm"
                >
                  <option value="analytical">
                    Analytical — Logic, assessment, threat evaluation
                  </option>
                  <option value="emotional">
                    Emotional — Visceral sensation, feelings first
                  </option>
                  <option value="instinctive">
                    Instinctive — Gut reactions, no analysis
                  </option>
                  <option value="sensory">
                    Sensory — Everything through texture, temperature, light
                  </option>
                  <option value="ritualistic">
                    Ritualistic — Patterns, habits, superstitions
                  </option>
                  <option value="detached">
                    Detached — Observational, disconnected from self
                  </option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1">
                  Internal Language Style
                </label>
                <input
                  type="text"
                  value={character.cognitiveFilter?.internalLanguage || ""}
                  onChange={(e) =>
                    updateCognitiveFilter("internalLanguage", e.target.value)
                  }
                  placeholder="e.g., operational jargon, poetic imagery, blunt pragmatism"
                  className="w-full px-3 py-2 border border-stone-300 rounded text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">
                Blind Spot
              </label>
              <input
                type="text"
                value={character.cognitiveFilter?.blindSpot || ""}
                onChange={(e) =>
                  updateCognitiveFilter("blindSpot", e.target.value)
                }
                placeholder="What can't they see about themselves? e.g., emotional vulnerability, own cruelty"
                className="w-full px-3 py-2 border border-stone-300 rounded text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">
                Repeating Thought Loop
              </label>
              <input
                type="text"
                value={character.cognitiveFilter?.repeatingThoughtLoop || ""}
                onChange={(e) =>
                  updateCognitiveFilter("repeatingThoughtLoop", e.target.value)
                }
                placeholder="Their recurring internal question, e.g., 'What's the threat? What's the exit?'"
                className="w-full px-3 py-2 border border-stone-300 rounded text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">
                Forbidden Words (comma-separated)
              </label>
              <CommaSeparatedInput
                values={character.cognitiveFilter?.forbiddenWords}
                onCommit={(forbiddenWords) =>
                  updateCognitiveFilter("forbiddenWords", forbiddenWords)
                }
                placeholder="Words this character would NEVER use in thought, e.g., love, weakness, sorry"
                className="w-full px-3 py-2 border border-stone-300 rounded text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">
                Signature Thoughts (comma-separated)
              </label>
              <CommaSeparatedInput
                values={character.cognitiveFilter?.signatureThoughts}
                onCommit={(signatureThoughts) =>
                  updateCognitiveFilter("signatureThoughts", signatureThoughts)
                }
                placeholder="Phrases unique to their internal voice, e.g., 'Focus. Breathe. Execute.'"
                className="w-full px-3 py-2 border border-stone-300 rounded text-sm"
              />
            </div>

            {!character.cognitiveFilter && (
              <button
                type="button"
                onClick={() =>
                  updateCognitiveFilter("primaryMode", "analytical")
                }
                className="text-sm text-purple-600 hover:text-purple-800"
              >
                + Initialize Cognitive Filter
              </button>
            )}
          </div>
        )}
      </div>

      <div className="flex justify-between pt-2">
        <button
          onClick={onDelete}
          className="px-3 py-2 text-red-600 hover:bg-red-50 rounded text-sm"
        >
          Delete Character
        </button>
        <button
          onClick={onClose}
          className="px-4 py-2 bg-stone-800 text-white rounded text-sm"
        >
          Done
        </button>
      </div>
    </div>
  );
}

function WorldTab({
  world,
  onChange,
}: {
  world: StoryBible["world"];
  onChange: (w: StoryBible["world"]) => void;
}): JSX.Element {
  const [rulesInput, setRulesInput] = useState(world.rules.join("\n"));
  const previousRulesRef = useRef(world.rules);

  // Fixed: Only sync when rules actually change from parent (not during typing)
  useEffect(() => {
    const rulesChanged =
      world.rules.length !== previousRulesRef.current.length ||
      world.rules.some((rule, i) => rule !== previousRulesRef.current[i]);

    if (rulesChanged) {
      previousRulesRef.current = world.rules;
      setRulesInput(world.rules.join("\n"));
    }
  }, [world.rules]);

  const handleRulesChange = (value: string): void => {
    setRulesInput(value);
    // Immediate save instead of onBlur to prevent cursor issues
    const rules = value.split("\n").filter(Boolean);
    previousRulesRef.current = rules;
    onChange({ ...world, rules });
  };

  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">
          Setting
        </label>
        <textarea
          value={world.setting}
          onChange={(e) => onChange({ ...world, setting: e.target.value })}
          placeholder="Describe the primary setting of your story..."
          rows={3}
          className="w-full px-4 py-2 border border-stone-300 rounded-lg"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">
          Time Period
        </label>
        <input
          type="text"
          value={world.timePeriod}
          onChange={(e) => onChange({ ...world, timePeriod: e.target.value })}
          placeholder="e.g., Medieval, Modern day, Distant future"
          className="w-full px-4 py-2 border border-stone-300 rounded-lg"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">
          World Rules (one per line)
        </label>
        <textarea
          value={rulesInput}
          onChange={(e) => handleRulesChange(e.target.value)}
          placeholder="e.g., Magic requires blood sacrifice&#10;Technology doesn't work in the Deadlands"
          rows={4}
          className="w-full px-4 py-2 border border-stone-300 rounded-lg"
        />
      </div>
    </div>
  );
}

function ActEditor({
  act,
  onChange,
  onDelete,
}: {
  act: EditableAct;
  onChange: (act: EditableAct) => void;
  onDelete: () => void;
}): JSX.Element {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="p-4 bg-stone-50 rounded-lg border border-stone-200">
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-3 flex-1">
          <span className="text-stone-500 font-bold">Act {act.number}</span>
          <input
            type="text"
            value={act.name}
            onChange={(e) => onChange({ ...act, name: e.target.value })}
            className="font-medium bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-stone-300 rounded px-2 py-1 flex-1"
            placeholder="Act name (e.g., Setup, Rising Action)"
          />
        </div>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-stone-500 hover:text-stone-700 text-sm ml-2"
        >
          {isExpanded ? "▼" : "▶"}
        </button>
      </div>

      <textarea
        value={act.description}
        onChange={(e) => onChange({ ...act, description: e.target.value })}
        className="text-sm w-full p-2 border border-stone-300 rounded resize-none"
        rows={2}
        placeholder="What happens in this act?"
      />

      {isExpanded && (
        <div className="mt-3 space-y-3 pt-3 border-t border-stone-300">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-stone-700 block mb-1">
                Chapters Start
              </label>
              <input
                type="number"
                value={act.chapterRange?.start || ""}
                onChange={(e) =>
                  onChange({
                    ...act,
                    chapterRange: {
                      start: e.target.value ? parseInt(e.target.value) : 1,
                      end:
                        act.chapterRange?.end || parseInt(e.target.value) || 1,
                    },
                  })
                }
                className="text-sm w-full p-2 border border-stone-300 rounded"
                placeholder="First chapter"
                min="1"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-stone-700 block mb-1">
                Chapters End
              </label>
              <input
                type="number"
                value={act.chapterRange?.end || ""}
                onChange={(e) =>
                  onChange({
                    ...act,
                    chapterRange: {
                      start: act.chapterRange?.start || 1,
                      end: e.target.value ? parseInt(e.target.value) : 1,
                    },
                  })
                }
                className="text-sm w-full p-2 border border-stone-300 rounded"
                placeholder="Last chapter"
                min="1"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-stone-700 block mb-1">
              Key Events
            </label>
            {(act.keyEvents || []).map((event, i) => (
              <div key={i} className="flex gap-1 mb-1">
                <input
                  type="text"
                  value={event}
                  onChange={(e) => {
                    const newEvents = [...(act.keyEvents || [])];
                    newEvents[i] = e.target.value;
                    onChange({ ...act, keyEvents: newEvents });
                  }}
                  className="text-sm flex-1 p-2 border border-stone-300 rounded"
                  placeholder={`Event ${i + 1}`}
                />
                <button
                  onClick={() => {
                    onChange({
                      ...act,
                      keyEvents: act.keyEvents.filter((_, idx) => idx !== i),
                    });
                  }}
                  className="px-2 text-stone-500 hover:text-red-600"
                >
                  ×
                </button>
              </div>
            ))}
            <button
              onClick={() => {
                onChange({ ...act, keyEvents: [...(act.keyEvents || []), ""] });
              }}
              className="text-xs px-2 py-1 border border-stone-300 rounded text-stone-600 hover:bg-stone-100"
            >
              + Add Event
            </button>
          </div>

          <button
            onClick={onDelete}
            className="w-full py-2 text-sm text-red-600 border border-red-300 rounded hover:bg-red-50"
          >
            Delete Act
          </button>
        </div>
      )}
    </div>
  );
}

function PlotTab({
  plotStructure,
  characters,
  onChange,
}: {
  plotStructure: StoryBible["plotStructure"];
  characters: Character[];
  onChange: (p: StoryBible["plotStructure"]) => void;
}): JSX.Element {
  const updateAct = (
    index: number,
    updated: (typeof plotStructure.acts)[0],
  ): void => {
    const newActs = [...plotStructure.acts];
    newActs[index] = updated;
    onChange({ ...plotStructure, acts: newActs });
  };

  const deleteAct = (index: number): void => {
    const remaining = plotStructure.acts.filter((_, i) => i !== index);
    // Renumber remaining acts
    const renumbered = remaining.map((act, i) => ({ ...act, number: i + 1 }));
    onChange({ ...plotStructure, acts: renumbered });
  };

  return (
    <div className="space-y-8">
      {/* Acts Section */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-semibold text-stone-800">Acts</h3>
            <p className="text-sm text-stone-500">
              Define the major structural divisions of your story
            </p>
          </div>
          <button
            onClick={() => {
              const newAct = {
                number: plotStructure.acts.length + 1,
                name: "",
                description: "",
                keyEvents: [],
                chapterRange: undefined,
              };
              onChange({
                ...plotStructure,
                acts: [...plotStructure.acts, newAct],
              });
            }}
            className="px-4 py-2 bg-stone-800 text-white rounded-lg text-sm"
          >
            + Add Act
          </button>
        </div>

        {plotStructure.acts.length === 0 ? (
          <p className="text-stone-500 text-center py-6 bg-stone-50 rounded-lg">
            No acts defined yet. Add acts to structure your story.
          </p>
        ) : (
          <div className="space-y-3">
            {plotStructure.acts.map((act, i) => (
              <ActEditor
                key={i}
                act={act}
                onChange={(updated) => updateAct(i, updated)}
                onDelete={() => deleteAct(i)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Plot Threads Section */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-semibold text-stone-800">Plot Threads</h3>
            <p className="text-sm text-stone-500">
              Track storylines that span across chapters
            </p>
          </div>
          <button
            onClick={() => {
              const newThread: PlotThread = {
                id: crypto.randomUUID(),
                name: "New Thread",
                type: "subplot",
                description: "",
                status: "setup",
                tension: "low",
              };
              onChange({
                ...plotStructure,
                plotThreads: [...plotStructure.plotThreads, newThread],
              });
            }}
            className="px-4 py-2 bg-stone-800 text-white rounded-lg text-sm"
          >
            + Add Thread
          </button>
        </div>

        {plotStructure.plotThreads.length === 0 ? (
          <p className="text-stone-500 text-center py-6 bg-stone-50 rounded-lg">
            No plot threads defined yet.
          </p>
        ) : (
          <div className="space-y-3">
            {plotStructure.plotThreads.map((thread, threadIdx) => (
              <PlotThreadEditor
                key={thread.id}
                thread={thread}
                characters={characters}
                threads={plotStructure.plotThreads}
                onChange={(updated) => {
                  const newThreads = [...plotStructure.plotThreads];
                  newThreads[threadIdx] = updated;
                  onChange({ ...plotStructure, plotThreads: newThreads });
                }}
                onDelete={() => {
                  onChange({
                    ...plotStructure,
                    plotThreads: plotStructure.plotThreads.filter(
                      (t) => t.id !== thread.id,
                    ),
                  });
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ChapterOutlinesTab({
  chapterOutlines,
  onChange,
}: {
  chapterOutlines: ChapterOutline[];
  onChange: (c: ChapterOutline[]) => void;
}): JSX.Element {
  const addChapter = (): void => {
    const newChapter: ChapterOutline = {
      chapterNumber: chapterOutlines.length + 1,
      title: `Chapter ${chapterOutlines.length + 1}`,
      summary: "",
      beats: [""],
      characters: [],
      location: "",
      timeframe: "",
    };
    onChange([...chapterOutlines, newChapter]);
  };

  const updateChapter = (
    index: number,
    updates: Partial<ChapterOutline>,
  ): void => {
    const updated = [...chapterOutlines];
    updated[index] = { ...updated[index], ...updates };
    onChange(updated);
  };

  const addBeat = (chapterIndex: number): void => {
    const updated = [...chapterOutlines];
    updated[chapterIndex] = {
      ...updated[chapterIndex],
      beats: [...updated[chapterIndex].beats, ""],
    };
    onChange(updated);
  };

  const updateBeat = (
    chapterIndex: number,
    beatIndex: number,
    value: string,
  ): void => {
    const updated = [...chapterOutlines];
    updated[chapterIndex] = {
      ...updated[chapterIndex],
      beats: updated[chapterIndex].beats.map((b, i) =>
        i === beatIndex ? value : b,
      ),
    };
    onChange(updated);
  };

  const removeBeat = (chapterIndex: number, beatIndex: number): void => {
    const updated = [...chapterOutlines];
    updated[chapterIndex] = {
      ...updated[chapterIndex],
      beats: updated[chapterIndex].beats.filter((_, i) => i !== beatIndex),
    };
    onChange(updated);
  };

  const removeChapter = (index: number): void => {
    // Remove chapter and renumber remaining chapters
    const remaining = chapterOutlines.filter((_, i) => i !== index);
    const renumbered = remaining.map((ch, i) => ({
      ...ch,
      chapterNumber: i + 1,
      title: ch.title.match(/^Chapter \d+/)
        ? `Chapter ${i + 1}${ch.title.replace(/^Chapter \d+/, "")}`
        : ch.title,
    }));
    onChange(renumbered);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-stone-800">Chapter Outlines</h3>
          <p className="text-sm text-stone-500">
            Define plot beats for each chapter. These guide the AI during
            generation.
          </p>
        </div>
        <button
          onClick={addChapter}
          className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm font-medium"
        >
          + Add Chapter
        </button>
      </div>

      {chapterOutlines.length === 0 ? (
        <div className="text-center py-12 bg-stone-50 rounded-lg">
          <p className="text-stone-500 mb-4">No chapter outlines yet.</p>
          <p className="text-sm text-stone-400">
            Use "Auto-Extract" to generate chapter outlines from your story, or
            add them manually.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {chapterOutlines.map((chapter, chapterIndex) => (
            <div
              key={chapterIndex}
              className="border border-stone-200 rounded-lg overflow-hidden"
            >
              <div className="bg-purple-50 px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-purple-700 font-bold">
                    Ch. {chapter.chapterNumber}
                  </span>
                  <input
                    type="text"
                    value={chapter.title}
                    onChange={(e) =>
                      updateChapter(chapterIndex, { title: e.target.value })
                    }
                    className="font-medium bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-purple-300 rounded px-2 py-1"
                    placeholder="Chapter Title"
                  />
                </div>
                <button
                  onClick={() => removeChapter(chapterIndex)}
                  className="text-red-500 hover:text-red-700 text-sm"
                >
                  Remove
                </button>
              </div>
              <div className="p-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Summary
                  </label>
                  <textarea
                    value={chapter.summary}
                    onChange={(e) =>
                      updateChapter(chapterIndex, { summary: e.target.value })
                    }
                    rows={2}
                    className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm"
                    placeholder="Brief chapter summary..."
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-stone-700 mb-1">
                      Location
                    </label>
                    <input
                      type="text"
                      value={chapter.location}
                      onChange={(e) =>
                        updateChapter(chapterIndex, {
                          location: e.target.value,
                        })
                      }
                      className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm"
                      placeholder="Primary location..."
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-stone-700 mb-1">
                      Timeframe
                    </label>
                    <input
                      type="text"
                      value={chapter.timeframe}
                      onChange={(e) =>
                        updateChapter(chapterIndex, {
                          timeframe: e.target.value,
                        })
                      }
                      className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm"
                      placeholder="When in timeline..."
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-2">
                    Plot Beats{" "}
                    <span className="text-purple-600">
                      ({chapter.beats.length})
                    </span>
                  </label>
                  <div className="space-y-2">
                    {chapter.beats.map((beat, beatIndex) => (
                      <div key={beatIndex} className="flex gap-2">
                        <span className="text-purple-400 font-mono text-sm pt-2">
                          {beatIndex + 1}.
                        </span>
                        <input
                          type="text"
                          value={beat}
                          onChange={(e) =>
                            updateBeat(chapterIndex, beatIndex, e.target.value)
                          }
                          className="flex-1 px-3 py-2 border border-stone-300 rounded-lg text-sm"
                          placeholder="Specific plot beat..."
                        />
                        <button
                          onClick={() => removeBeat(chapterIndex, beatIndex)}
                          className="text-red-400 hover:text-red-600 px-2"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => addBeat(chapterIndex)}
                    className="mt-2 text-sm text-purple-600 hover:text-purple-800"
                  >
                    + Add Beat
                  </button>
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Characters in Chapter
                  </label>
                  <CommaSeparatedInput
                    values={chapter.characters}
                    onCommit={(characters) =>
                      updateChapter(chapterIndex, { characters })
                    }
                    className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm"
                    placeholder="Character names, comma-separated..."
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StyleTab({
  styleDirectives,
  onChange,
}: {
  styleDirectives: StoryBible["styleDirectives"];
  onChange: (s: StoryBible["styleDirectives"]) => void;
}): JSX.Element {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1">
            Point of View
          </label>
          <select
            value={styleDirectives.pov}
            onChange={(e) =>
              onChange({ ...styleDirectives, pov: e.target.value })
            }
            className="w-full px-4 py-2 border border-stone-300 rounded-lg"
          >
            <option value="first">First Person</option>
            <option value="third-limited">Third Person Limited</option>
            <option value="third-omniscient">Third Person Omniscient</option>
            <option value="second">Second Person</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1">
            Tense
          </label>
          <select
            value={styleDirectives.tense}
            onChange={(e) =>
              onChange({ ...styleDirectives, tense: e.target.value })
            }
            className="w-full px-4 py-2 border border-stone-300 rounded-lg"
          >
            <option value="past">Past Tense</option>
            <option value="present">Present Tense</option>
          </select>
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">
          Prose Style
        </label>
        <textarea
          value={styleDirectives.proseStyle}
          onChange={(e) =>
            onChange({ ...styleDirectives, proseStyle: e.target.value })
          }
          placeholder="Describe the prose style (e.g., Sparse and punchy, Lyrical and flowing, Dense and descriptive)"
          rows={2}
          className="w-full px-4 py-2 border border-stone-300 rounded-lg"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">
          Dialogue Style
        </label>
        <textarea
          value={styleDirectives.dialogueStyle}
          onChange={(e) =>
            onChange({ ...styleDirectives, dialogueStyle: e.target.value })
          }
          placeholder="Describe the dialogue approach (e.g., Snappy and witty, Realistic with interruptions, Formal and measured)"
          rows={2}
          className="w-full px-4 py-2 border border-stone-300 rounded-lg"
        />
      </div>
    </div>
  );
}
