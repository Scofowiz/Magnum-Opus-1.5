import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  type JSX,
} from "react";
import { AuthorProfile } from "./AuthorProfile";
import {
  DEFAULT_APP_PREFERENCES,
  type AppPreferences,
} from "../types/preferences";
import { withApiBase } from "../lib/apiBase";

const DEFAULT_CODEX_MODEL = "gpt-5.1-codex";

interface ProviderConfig {
  type: string;
  model: string;
  baseUrl?: string;
  hasApiKey: boolean;
  availableProviders: {
    type: string;
    name: string;
    dynamicModels?: boolean;
    customModel?: boolean;
    defaultBaseUrl?: string;
  }[];
}

interface ModelOption {
  id: string;
  name: string;
}

interface CodexStatus {
  available: boolean;
  loggedIn: boolean;
  mode?: string;
  message: string;
}

interface LifetimeMemorySnapshot {
  totalGenerations?: number;
  totalFeedback?: number;
  projectMemoryCount?: number;
  layers?: {
    craft?: {
      count?: number;
      topPatterns?: string[];
    };
    lifetime?: {
      topInsights?: string[];
    };
    preference?: {
      preferredPov?: string;
      preferredTense?: string;
      contextWindowSize?: number;
      enableContinuityChecks?: boolean;
      persistentDirectionsCount?: number;
    };
    context?: {
      plannerEnabled?: boolean;
      plannerHistoryCount?: number;
      plannerEvidenceDepth?: number;
      styleSampleCount?: number;
      projectMemoryCount?: number;
      projectEventCount?: number;
    };
  };
}

function normalizeCodexModel(model?: string): string {
  const candidate = model?.trim();
  if (!candidate) return DEFAULT_CODEX_MODEL;
  if (/\s/.test(candidate)) return DEFAULT_CODEX_MODEL;
  return candidate;
}

export function Settings(): JSX.Element {
  const [preferences, setPreferences] = useState<AppPreferences>(
    DEFAULT_APP_PREFERENCES,
  );
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [craftPatterns, setCraftPatterns] = useState<unknown[]>([]);
  const [lifetimeMemory, setLifetimeMemory] =
    useState<LifetimeMemorySnapshot | null>(null);
  const [activeSettingsTab, setActiveSettingsTab] = useState<
    "general" | "author"
  >("general");

  // Provider state
  const [providerConfig, setProviderConfig] = useState<ProviderConfig | null>(
    null,
  );
  const [selectedProvider, setSelectedProvider] = useState("groq");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [selectedModel, setSelectedModel] = useState("");
  const [customModel, setCustomModel] = useState("");
  const [availableModels, setAvailableModels] = useState<ModelOption[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [codexStatus, setCodexStatus] = useState<CodexStatus | null>(null);
  const [isCheckingCodexStatus, setIsCheckingCodexStatus] = useState(false);
  const isMountedRef = useRef(true);

  const taskProviderOptions = useMemo(
    () => [
      { type: "main", name: "Main Provider" },
      ...(providerConfig?.availableProviders || []),
    ],
    [providerConfig?.availableProviders],
  );

  const embeddingProviderOptions = useMemo(
    () =>
      taskProviderOptions.filter(
        (option) =>
          option.type === "main" ||
          option.type === "ollama" ||
          option.type === "openai" ||
          option.type === "openai-compatible",
      ),
    [taskProviderOptions],
  );

  useEffect(() => {
    isMountedRef.current = true;
    return (): void => {
      isMountedRef.current = false;
    };
  }, []);

  const fetchJson = useCallback(async (url: string) => {
    const res = await fetch(url);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || `Request failed: ${url}`);
    }
    return data;
  }, []);

  const setMessageSafe = useCallback(
    (next: { type: "success" | "error"; text: string } | null) => {
      if (isMountedRef.current) setMessage(next);
    },
    [],
  );

  const fetchCodexStatus = useCallback(async () => {
    setIsCheckingCodexStatus(true);
    try {
      const status = await fetchJson(withApiBase("/api/provider/codex/status"));
      if (isMountedRef.current) setCodexStatus(status);
    } catch (error) {
      if (isMountedRef.current) {
        setCodexStatus({
          available: false,
          loggedIn: false,
          message: String(error),
        });
      }
    } finally {
      if (isMountedRef.current) setIsCheckingCodexStatus(false);
    }
  }, [fetchJson]);

  // Fetch models using existing server-side API key
  const fetchModelsWithExistingKey = async (
    providerType: string,
    ollamaUrl?: string,
  ): Promise<void> => {
    setIsLoadingModels(true);
    setModelError(null);

    try {
      let url = "";
      if (providerType === "groq") {
        url = withApiBase("/api/provider/groq/models");
      } else if (providerType === "google") {
        url = withApiBase("/api/provider/google/models");
      } else if (providerType === "ollama") {
        const base = ollamaUrl || "http://localhost:11434";
        url = withApiBase(
          `/api/provider/ollama/models?baseUrl=${encodeURIComponent(base)}`,
        );
      }

      if (url) {
        const res = await fetch(url);
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        if (isMountedRef.current) {
          setAvailableModels(data.models || []);
        }
      }
    } catch (e) {
      if (isMountedRef.current) {
        setModelError(String(e));
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoadingModels(false);
      }
    }
  };

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetchJson(withApiBase("/api/preferences")),
      fetchJson(withApiBase("/api/craft-patterns")),
      fetchJson(withApiBase("/api/lifetime-memory")),
      fetchJson(withApiBase("/api/provider")),
    ])
      .then(([prefs, patterns, memory, provider]) => {
        if (cancelled || !isMountedRef.current) return;
        setPreferences({
          ...DEFAULT_APP_PREFERENCES,
          ...(prefs as Partial<AppPreferences>),
        });
        setCraftPatterns(patterns);
        setLifetimeMemory(memory);
        setProviderConfig(provider);
        setSelectedProvider(provider.type || "groq");
        const initialModel =
          provider.type === "codex"
            ? normalizeCodexModel(provider.model)
            : provider.model || "";
        setSelectedModel(initialModel);
        setCustomModel(initialModel);
        setBaseUrl(provider.baseUrl || "");

        // Auto-fetch models if API key is already configured
        if (
          provider.hasApiKey &&
          (provider.type === "groq" || provider.type === "google")
        ) {
          fetchModelsWithExistingKey(provider.type);
        } else if (provider.type === "ollama") {
          fetchModelsWithExistingKey("ollama", provider.baseUrl);
        } else if (provider.type === "codex") {
          fetchCodexStatus();
        }
      })
      .catch((error) => {
        if (!cancelled && isMountedRef.current) {
          setMessageSafe({
            type: "error",
            text: `Failed to load settings: ${String(error)}`,
          });
        }
      });
    return (): void => {
      cancelled = true;
    };
  }, [fetchCodexStatus, fetchJson, setMessageSafe]);

  useEffect(() => {
    if (selectedProvider === "codex") {
      fetchCodexStatus();
    }
  }, [fetchCodexStatus, selectedProvider]);

  // Fetch models when provider changes or API key is entered
  const fetchModels = async (provider: string, key?: string): Promise<void> => {
    if (isMountedRef.current) {
      setIsLoadingModels(true);
      setModelError(null);
      setAvailableModels([]);
    }

    try {
      let url = "";
      let options: RequestInit = {};

      if (provider === "groq") {
        url = withApiBase("/api/provider/groq/models");
        if (key) {
          // Pass API key in header instead of URL for security
          options = {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ apiKey: key }),
          };
        }
      } else if (provider === "google") {
        url = withApiBase("/api/provider/google/models");
        if (key) {
          // Pass API key in header instead of URL for security
          options = {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ apiKey: key }),
          };
        }
      } else if (provider === "ollama") {
        const ollamaUrl = baseUrl || "http://localhost:11434";
        url = withApiBase(
          `/api/provider/ollama/models?baseUrl=${encodeURIComponent(ollamaUrl)}`,
        );
      }

      if (url) {
        const res = await fetch(url, options);
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        if (isMountedRef.current) {
          setAvailableModels(data.models || []);
        }
      }
    } catch (e) {
      if (isMountedRef.current) setModelError(String(e));
    } finally {
      if (isMountedRef.current) setIsLoadingModels(false);
    }
  };

  const saveProvider = async (): Promise<void> => {
    if (isMountedRef.current) setIsSaving(true);
    try {
      const model =
        selectedProvider === "ollama"
          ? customModel || selectedModel
          : selectedProvider === "codex"
            ? normalizeCodexModel(customModel || selectedModel)
            : selectedModel;
      const res = await fetch(withApiBase("/api/provider"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: selectedProvider,
          apiKey: apiKey || undefined,
          baseUrl: baseUrl || undefined,
          model,
        }),
      });
      if (!res.ok) throw new Error("Provider update failed");
      setMessageSafe({ type: "success", text: "Provider settings saved!" });
    } catch {
      setMessageSafe({
        type: "error",
        text: "Failed to save provider settings",
      });
    } finally {
      if (isMountedRef.current) setIsSaving(false);
    }
  };

  const testConnection = async (): Promise<void> => {
    if (isMountedRef.current) setIsTestingConnection(true);
    try {
      if (selectedProvider === "codex") {
        const status = await fetchJson(withApiBase("/api/provider/codex/status"));
        if (isMountedRef.current) setCodexStatus(status);
        if (!status.loggedIn) {
          setMessageSafe({
            type: "error",
            text: "Codex is not logged in. Run `codex login` in a terminal, then retry.",
          });
          return;
        }
      }

      const res = await fetch(withApiBase("/api/provider/test"), {
        method: "POST",
      });
      const data = await res.json();
      if (data.success) {
        setMessageSafe({
          type: "success",
          text: `Connection successful! Model: ${data.model}`,
        });
      } else {
        setMessageSafe({
          type: "error",
          text: data.error || "Connection failed",
        });
      }
    } catch (e) {
      setMessageSafe({ type: "error", text: String(e) });
    } finally {
      if (isMountedRef.current) setIsTestingConnection(false);
    }
  };

  const savePreferences = async (): Promise<void> => {
    if (isMountedRef.current) setIsSaving(true);
    setMessageSafe(null);

    try {
      const res = await fetch(withApiBase("/api/preferences"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(preferences),
      });

      if (!res.ok) throw new Error("Failed to save");
      setMessageSafe({
        type: "success",
        text: "Preferences saved successfully!",
      });
    } catch {
      setMessageSafe({ type: "error", text: "Failed to save preferences" });
    } finally {
      if (isMountedRef.current) setIsSaving(false);
    }
  };

  const updatePreference = <K extends keyof AppPreferences>(
    key: K,
    value: AppPreferences[K],
  ): void => {
    const clamp = (val: number, min: number, max: number): number =>
      Math.min(max, Math.max(min, val));
    let normalized: AppPreferences[K] = value;
    if (typeof value === "number") {
      if (key === "temperature")
        normalized = clamp(value, 0, 1) as AppPreferences[K];
      else if (key === "topP")
        normalized = clamp(value, 0.5, 1) as AppPreferences[K];
      else if (key === "frequencyPenalty")
        normalized = clamp(value, 0, 2) as AppPreferences[K];
      else if (key === "presencePenalty")
        normalized = clamp(value, -1, 1) as AppPreferences[K];
      else if (key === "targetWords")
        normalized = clamp(value, 500, 5000) as AppPreferences[K];
      else if (key === "contextWindowSize")
        normalized = clamp(value, 2000, 20000) as AppPreferences[K];
      else if (key === "promptPlannerTopK")
        normalized = clamp(value, 3, 20) as AppPreferences[K];
    }
    setPreferences((prev) => ({ ...prev, [key]: normalized }));
  };

  const clearCraftPatterns = async (): Promise<void> => {
    if (!confirm("Clear all learned craft patterns? This cannot be undone."))
      return;

    try {
      const res = await fetch(withApiBase("/api/craft-patterns"), {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to clear craft patterns");
      if (!isMountedRef.current) return;
      setCraftPatterns([]);
      setLifetimeMemory((previous) =>
        previous
          ? {
              ...previous,
              layers: previous.layers
                ? {
                    ...previous.layers,
                    craft: {
                      ...(previous.layers.craft || {}),
                      count: 0,
                      topPatterns: [],
                    },
                  }
                : previous.layers,
            }
          : previous,
      );
      setMessageSafe({ type: "success", text: "Craft patterns cleared" });
    } catch {
      setMessageSafe({ type: "error", text: "Failed to clear craft patterns" });
    }
  };

  const clearLifetimeMemory = async (): Promise<void> => {
    if (
      !confirm(
        "Clear lifetime memory? This includes all learned preferences across projects.",
      )
    )
      return;

    try {
      const res = await fetch(withApiBase("/api/lifetime-memory"), {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to clear lifetime memory");
      if (!isMountedRef.current) return;
      setLifetimeMemory(null);
      setMessageSafe({ type: "success", text: "Lifetime memory cleared" });
    } catch {
      setMessageSafe({
        type: "error",
        text: "Failed to clear lifetime memory",
      });
    }
  };

  return (
    <div className="settings-shell max-w-4xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-stone-800">Settings</h1>
        <p className="text-stone-600 mt-1">
          Configure Magnum Opus to match your writing workflow and preferences.
        </p>
      </div>

      {/* Settings Tabs */}
      <div className="flex gap-2 border-b border-stone-200 mb-6">
        {[
          { id: "general", label: "General Settings", icon: "⚙️" },
          { id: "author", label: "Author Profile", icon: "👤" },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() =>
              setActiveSettingsTab(tab.id as typeof activeSettingsTab)
            }
            className={`px-4 py-2 font-medium text-sm transition-colors ${
              activeSettingsTab === tab.id
                ? "border-b-2 border-stone-800 text-stone-800"
                : "text-stone-600 hover:text-stone-800"
            }`}
          >
            <span className="mr-2">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      <div className="h-14 mb-2">
        {message && (
          <div
            className={`p-4 rounded-lg ${
              message.type === "success"
                ? "bg-green-50 border border-green-200 text-green-700"
                : "bg-red-50 border border-red-200 text-red-700"
            }`}
          >
            {message.text}
          </div>
        )}
      </div>

      {activeSettingsTab === "author" ? (
        <AuthorProfile onMessage={setMessage} />
      ) : (
        <div className="space-y-8">
          {/* AI Provider Settings */}
          <section className="env-card rounded-xl border border-stone-200 p-6">
            <h2 className="text-xl font-semibold text-stone-800 mb-4">
              AI Provider
            </h2>

            <div className="space-y-6">
              {/* Provider Selection */}
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-2">
                  Provider
                </label>
                <select
                  value={selectedProvider}
                  onChange={(e) => {
                    setSelectedProvider(e.target.value);
                    setAvailableModels([]);
                    const nextModel =
                      e.target.value === "codex" ? DEFAULT_CODEX_MODEL : "";
                    setSelectedModel(nextModel);
                    setCustomModel(nextModel);
                    const prov = providerConfig?.availableProviders.find(
                      (p) => p.type === e.target.value,
                    );
                    if (prov?.defaultBaseUrl) setBaseUrl(prov.defaultBaseUrl);
                    else if (e.target.value === "codex") setBaseUrl("");
                  }}
                  className="w-full px-4 py-2 border border-stone-300 rounded-lg"
                >
                  {providerConfig?.availableProviders.map((p) => (
                    <option key={p.type} value={p.type}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* API Key (for Groq/Google) */}
              {(selectedProvider === "groq" ||
                selectedProvider === "google") && (
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-2">
                    API Key{" "}
                    {providerConfig?.hasApiKey && (
                      <span className="text-green-600">(configured)</span>
                    )}
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="password"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder={
                        providerConfig?.hasApiKey ? "••••••••" : "Enter API key"
                      }
                      className="flex-1 px-4 py-2 border border-stone-300 rounded-lg"
                    />
                    <button
                      onClick={() =>
                        apiKey
                          ? fetchModels(selectedProvider, apiKey)
                          : fetchModelsWithExistingKey(selectedProvider)
                      }
                      disabled={
                        isLoadingModels ||
                        (!apiKey && !providerConfig?.hasApiKey)
                      }
                      className="px-4 py-2 bg-stone-700 text-white rounded-lg hover:bg-stone-600 disabled:opacity-50"
                    >
                      {isLoadingModels ? "Loading..." : "Fetch Models"}
                    </button>
                  </div>
                  {providerConfig?.hasApiKey && !apiKey && (
                    <p className="mt-1 text-xs text-stone-500">
                      Leave empty to use existing key
                    </p>
                  )}
                </div>
              )}

              {selectedProvider === "codex" && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-950 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium">
                        Uses your local Codex login and ChatGPT account instead
                        of an API key.
                      </p>
                      <p className="text-amber-800">
                        Run <span className="font-mono">codex login</span> in a
                        terminal first, then refresh the status here.
                      </p>
                    </div>
                    <button
                      onClick={fetchCodexStatus}
                      disabled={isCheckingCodexStatus}
                      className="px-3 py-2 border border-amber-300 rounded-lg bg-white/80 hover:bg-white disabled:opacity-50"
                    >
                      {isCheckingCodexStatus ? "Checking..." : "Check Login"}
                    </button>
                  </div>
                  <div
                    className={`rounded-lg border px-3 py-2 ${
                      codexStatus?.loggedIn
                        ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                        : "border-amber-200 bg-white/70 text-amber-900"
                    }`}
                  >
                    {codexStatus?.loggedIn
                      ? `Logged in${codexStatus.mode ? ` via ${codexStatus.mode}` : ""}.`
                      : "Not logged in yet."}
                  </div>
                  <p className="text-xs text-amber-800">
                    Recommended model:{" "}
                    <span className="font-mono">{DEFAULT_CODEX_MODEL}</span>
                  </p>
                  {codexStatus?.message && (
                    <p className="text-xs text-amber-800 whitespace-pre-wrap">
                      {codexStatus.message}
                    </p>
                  )}
                </div>
              )}

              {/* Base URL (for Ollama) */}
              {selectedProvider === "ollama" && (
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-2">
                    Ollama URL
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={baseUrl}
                      onChange={(e) => setBaseUrl(e.target.value)}
                      placeholder="http://localhost:11434"
                      className="flex-1 px-4 py-2 border border-stone-300 rounded-lg"
                    />
                    <button
                      onClick={() => fetchModels("ollama")}
                      disabled={isLoadingModels}
                      className="px-4 py-2 bg-stone-700 text-white rounded-lg hover:bg-stone-600 disabled:opacity-50"
                    >
                      {isLoadingModels ? "Loading..." : "Fetch Models"}
                    </button>
                  </div>
                </div>
              )}

              {/* Model Error */}
              {modelError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                  {modelError}
                </div>
              )}

              {/* Model Selection */}
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-2">
                  Model
                </label>
                {availableModels.length > 0 ? (
                  <select
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    className="w-full px-4 py-2 border border-stone-300 rounded-lg"
                  >
                    <option value="">Select a model...</option>
                    {availableModels.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={customModel || selectedModel}
                    onChange={(e) => {
                      setCustomModel(e.target.value);
                      setSelectedModel(e.target.value);
                    }}
                    placeholder={
                      selectedProvider === "ollama"
                        ? "e.g., llama3.2, mistral"
                        : selectedProvider === "codex"
                          ? "e.g., gpt-5.1-codex"
                          : 'Click "Fetch Models" to load available models'
                    }
                    className="w-full px-4 py-2 border border-stone-300 rounded-lg"
                  />
                )}
                {providerConfig?.model && (
                  <p className="mt-1 text-sm text-stone-500">
                    Current:{" "}
                    <span className="font-mono text-stone-700">
                      {providerConfig.model}
                    </span>
                  </p>
                )}
              </div>

              {/* Save & Test */}
              <div className="flex gap-3">
                <button
                  onClick={saveProvider}
                  disabled={isSaving || (!selectedModel && !customModel)}
                  className="px-6 py-2 bg-stone-800 text-white rounded-lg hover:bg-stone-700 disabled:opacity-50 min-w-32"
                >
                  {isSaving ? "Saving..." : "Save Provider"}
                </button>
                <button
                  onClick={testConnection}
                  disabled={isTestingConnection}
                  className="px-6 py-2 border border-stone-300 rounded-lg hover:bg-stone-50 disabled:opacity-50"
                >
                  {isTestingConnection ? "Testing..." : "Test Connection"}
                </button>
              </div>
            </div>
          </section>

          {/* Generation Settings */}
          <section className="env-card rounded-xl border border-stone-200 p-6">
            <h2 className="text-xl font-semibold text-stone-800 mb-4">
              Generation Settings
            </h2>

            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-2">
                  Temperature: {preferences.temperature.toFixed(1)}
                </label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={preferences.temperature}
                  onChange={(e) =>
                    updatePreference("temperature", parseFloat(e.target.value))
                  }
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-stone-500 mt-1">
                  <span>More Focused (0.0)</span>
                  <span>More Creative (1.0)</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-stone-700 mb-2">
                  Top-P (Nucleus Sampling): {preferences.topP.toFixed(2)}
                </label>
                <input
                  type="range"
                  min="0.5"
                  max="1"
                  step="0.05"
                  value={preferences.topP}
                  onChange={(e) =>
                    updatePreference("topP", parseFloat(e.target.value))
                  }
                  className="w-full"
                />
                <p className="mt-1 text-sm text-stone-500">
                  0.75 keeps the highest-probability 75% token mass. This is
                  top-p (nucleus), not top-k.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-stone-700 mb-2">
                  Repetition Penalty (Frequency):{" "}
                  {preferences.frequencyPenalty.toFixed(2)}
                </label>
                <input
                  type="range"
                  min="0"
                  max="2"
                  step="0.05"
                  value={preferences.frequencyPenalty}
                  onChange={(e) =>
                    updatePreference(
                      "frequencyPenalty",
                      parseFloat(e.target.value),
                    )
                  }
                  className="w-full"
                />
                <p className="mt-1 text-sm text-stone-500">
                  Short-term anti-loop pressure. Higher values suppress
                  immediate token reuse.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-stone-700 mb-2">
                  Common-Word Credit (Presence):{" "}
                  {preferences.presencePenalty.toFixed(2)}
                </label>
                <input
                  type="range"
                  min="-1"
                  max="1"
                  step="0.05"
                  value={preferences.presencePenalty}
                  onChange={(e) =>
                    updatePreference(
                      "presencePenalty",
                      parseFloat(e.target.value),
                    )
                  }
                  className="w-full"
                />
                <p className="mt-1 text-sm text-stone-500">
                  Slightly negative values preserve natural glue words and
                  recurring cadence.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-stone-700 mb-2">
                  Default Target Words: {preferences.targetWords}
                </label>
                <input
                  type="range"
                  min="500"
                  max="5000"
                  step="250"
                  value={preferences.targetWords}
                  onChange={(e) =>
                    updatePreference("targetWords", parseInt(e.target.value))
                  }
                  className="w-full"
                />
                <p className="mt-1 text-sm text-stone-500">
                  Default chapter target for manual generation and new
                  autonomous writer sessions. You can still override it inside
                  the writer.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-stone-700 mb-2">
                  Context Window Size:{" "}
                  {preferences.contextWindowSize.toLocaleString()} characters
                </label>
                <input
                  type="range"
                  min="2000"
                  max="20000"
                  step="1000"
                  value={preferences.contextWindowSize}
                  onChange={(e) =>
                    updatePreference(
                      "contextWindowSize",
                      parseInt(e.target.value),
                    )
                  }
                  className="w-full"
                />
                <p className="mt-1 text-sm text-stone-500">
                  How much surrounding text to include for context
                  (bidirectional from cursor).
                </p>
              </div>

              <div className="border-t border-stone-200 pt-6">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="font-medium text-stone-700">
                      Enable Scene Prompt Planner
                    </div>
                    <div className="text-sm text-stone-500">
                      Build a scene brief before manual generation. Embeddings
                      are optional, and unsupported providers fall back to
                      lexical ranking.
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={preferences.enablePromptPlanner}
                      onChange={(e) =>
                        updatePreference(
                          "enablePromptPlanner",
                          e.target.checked,
                        )
                      }
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-stone-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-stone-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-stone-700"></div>
                  </label>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="block text-xs font-medium uppercase tracking-[0.14em] text-stone-500 mb-1">
                      Embedding Provider
                    </label>
                    <select
                      value={preferences.promptPlannerEmbeddingProvider}
                      onChange={(e) =>
                        updatePreference(
                          "promptPlannerEmbeddingProvider",
                          e.target.value,
                        )
                      }
                      className="w-full px-4 py-2 border border-stone-300 rounded-lg mb-2"
                    >
                      {embeddingProviderOptions.map((option) => (
                        <option key={option.type} value={option.type}>
                          {option.name}
                        </option>
                      ))}
                    </select>
                    <label className="block text-sm font-medium text-stone-700 mb-1">
                      Embedding Model (optional)
                    </label>
                    <input
                      type="text"
                      value={preferences.promptPlannerEmbeddingModel}
                      onChange={(e) =>
                        updatePreference(
                          "promptPlannerEmbeddingModel",
                          e.target.value,
                        )
                      }
                      placeholder="text-embedding-3-small or qwen3-embedding:0.6b"
                      className="w-full px-4 py-2 border border-stone-300 rounded-lg font-mono text-sm"
                    />
                    <p className="mt-1 text-sm text-stone-500">
                      Uses the saved config for the selected provider. If
                      embeddings are unavailable, evidence ranking falls back to
                      lexical similarity.
                    </p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium uppercase tracking-[0.14em] text-stone-500 mb-1">
                      Planner Provider
                    </label>
                    <select
                      value={preferences.promptPlannerProvider}
                      onChange={(e) =>
                        updatePreference(
                          "promptPlannerProvider",
                          e.target.value,
                        )
                      }
                      className="w-full px-4 py-2 border border-stone-300 rounded-lg mb-2"
                    >
                      {taskProviderOptions.map((option) => (
                        <option key={option.type} value={option.type}>
                          {option.name}
                        </option>
                      ))}
                    </select>
                    <label className="block text-sm font-medium text-stone-700 mb-1">
                      Planner Model (optional)
                    </label>
                    <input
                      type="text"
                      value={preferences.promptPlannerModel}
                      onChange={(e) =>
                        updatePreference("promptPlannerModel", e.target.value)
                      }
                      placeholder="qwen3:0.6b, gpt-4.1-mini, qwen2.5:4b-instruct, etc."
                      className="w-full px-4 py-2 border border-stone-300 rounded-lg font-mono text-sm"
                    />
                    <p className="mt-1 text-sm text-stone-500">
                      Refines the scene brief when available. A good first pass
                      is `qwen3:0.6b`; if that earns its keep, you can step up
                      to a larger model later.
                    </p>
                  </div>
                </div>

                <div className="mt-4">
                  <label className="block text-xs font-medium uppercase tracking-[0.14em] text-stone-500 mb-1">
                    Story Bible Provider
                  </label>
                  <select
                    value={preferences.storyBibleProvider}
                    onChange={(e) =>
                      updatePreference("storyBibleProvider", e.target.value)
                    }
                    className="w-full px-4 py-2 border border-stone-300 rounded-lg mb-2"
                  >
                    {taskProviderOptions.map((option) => (
                      <option key={option.type} value={option.type}>
                        {option.name}
                      </option>
                    ))}
                  </select>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Story Bible Model (optional)
                  </label>
                  <input
                    type="text"
                    value={preferences.storyBibleModel}
                    onChange={(e) =>
                      updatePreference("storyBibleModel", e.target.value)
                    }
                    placeholder="qwen3-coder:480b-cloud, kimi-k2.5:cloud, gpt-4.1, etc."
                    className="w-full px-4 py-2 border border-stone-300 rounded-lg font-mono text-sm"
                  />
                  <p className="mt-1 text-sm text-stone-500">
                    Used for Story Bible extraction and chapter-outline
                    synthesis. Leave blank to use the main provider model.
                  </p>
                </div>

                <div className="mt-4">
                  <label className="block text-sm font-medium text-stone-700 mb-2">
                    Prompt Planner Evidence Depth:{" "}
                    {preferences.promptPlannerTopK}
                  </label>
                  <input
                    type="range"
                    min="3"
                    max="20"
                    step="1"
                    value={preferences.promptPlannerTopK}
                    onChange={(e) =>
                      updatePreference(
                        "promptPlannerTopK",
                        parseInt(e.target.value),
                      )
                    }
                    className="w-full"
                  />
                  <p className="mt-1 text-sm text-stone-500">
                    Higher values pull in more candidate evidence from the
                    current project before the brief is built.
                  </p>
                </div>

                <div className="mt-4">
                  <label className="block text-sm font-medium text-stone-700 mb-2">
                    Prompt Planner Fallback
                  </label>
                  <select
                    value={preferences.promptPlannerFallbackMode}
                    onChange={(e) =>
                      updatePreference(
                        "promptPlannerFallbackMode",
                        e.target
                          .value as AppPreferences["promptPlannerFallbackMode"],
                      )
                    }
                    className="w-full px-4 py-2 border border-stone-300 rounded-lg"
                  >
                    <option value="error">Error and prompt to switch</option>
                    <option value="lexical">Allow lexical fallback</option>
                  </select>
                  <p className="mt-1 text-sm text-stone-500">
                    When embeddings are unavailable, show a prompt instead of
                    silently switching to lexical scoring.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Quality Settings */}
          <section className="env-card rounded-xl border border-stone-200 p-6">
            <h2 className="text-xl font-semibold text-stone-800 mb-4">
              Quality Control
            </h2>

            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-stone-700">
                    Show Quality Scores
                  </div>
                  <div className="text-sm text-stone-500">
                    Display quality rating for each generation
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={preferences.showQualityScores}
                    onChange={(e) =>
                      updatePreference("showQualityScores", e.target.checked)
                    }
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-stone-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-stone-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-stone-700"></div>
                </label>
              </div>

              <div>
                <label className="block text-sm font-medium text-stone-700 mb-2">
                  Minimum Quality Threshold: {preferences.minQualityThreshold}
                  /10
                </label>
                <input
                  type="range"
                  min="1"
                  max="10"
                  step="1"
                  value={preferences.minQualityThreshold}
                  onChange={(e) =>
                    updatePreference(
                      "minQualityThreshold",
                      parseInt(e.target.value),
                    )
                  }
                  className="w-full"
                />
                <p className="mt-1 text-sm text-stone-500">
                  Generations below this score will be automatically
                  regenerated.
                </p>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-stone-700">
                    Enable Continuity Checks
                  </div>
                  <div className="text-sm text-stone-500">
                    Validate new text against your Story Bible
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={preferences.enableContinuityChecks}
                    onChange={(e) =>
                      updatePreference(
                        "enableContinuityChecks",
                        e.target.checked,
                      )
                    }
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-stone-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-stone-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-stone-700"></div>
                </label>
              </div>
            </div>
          </section>

          {/* Writing Preferences */}
          <section className="env-card rounded-xl border border-stone-200 p-6">
            <h2 className="text-xl font-semibold text-stone-800 mb-4">
              Default Writing Style
            </h2>

            <div className="grid gap-6 md:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-2">
                  Preferred Point of View
                </label>
                <select
                  value={preferences.preferredPOV}
                  onChange={(e) =>
                    updatePreference("preferredPOV", e.target.value)
                  }
                  className="w-full px-4 py-2 border border-stone-300 rounded-lg"
                >
                  <option value="first">First Person</option>
                  <option value="second">Second Person</option>
                  <option value="third-limited">Third Person Limited</option>
                  <option value="third-omniscient">
                    Third Person Omniscient
                  </option>
                  <option value="third-objective">
                    Third Person Objective
                  </option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-stone-700 mb-2">
                  Preferred Tense
                </label>
                <select
                  value={preferences.preferredTense}
                  onChange={(e) =>
                    updatePreference("preferredTense", e.target.value)
                  }
                  className="w-full px-4 py-2 border border-stone-300 rounded-lg"
                >
                  <option value="past">Past Tense</option>
                  <option value="present">Present Tense</option>
                </select>
              </div>
            </div>

            <p className="mt-4 text-sm text-stone-500">
              These defaults are used when no Story Bible is configured.
              Project-specific settings override these.
            </p>

            <div className="mt-6">
              <label className="block text-sm font-medium text-stone-700 mb-2">
                Persistent Directions
              </label>
              <textarea
                value={preferences.persistentDirections}
                onChange={(e) =>
                  updatePreference("persistentDirections", e.target.value)
                }
                rows={6}
                placeholder={
                  "One durable direction per line.\nExample: Keep chapters in close third unless the scene clearly establishes otherwise.\nExample: Favor scene-complete beats over outline labels."
                }
                className="w-full px-4 py-3 border border-stone-300 rounded-lg font-mono text-sm"
              />
              <p className="mt-2 text-sm text-stone-500">
                These are standing author directives. They are injected into
                generation until you remove them.
              </p>
            </div>
          </section>

          {/* Memory Management */}
          <section className="env-card rounded-xl border border-stone-200 p-6">
            <h2 className="text-xl font-semibold text-stone-800 mb-4">
              Memory Management
            </h2>

            <div className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-xl border border-stone-200 bg-stone-50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium text-stone-700">
                        Craft Layer
                      </div>
                      <div className="mt-1 text-sm text-stone-500">
                        {lifetimeMemory?.layers?.craft
                          ? `${lifetimeMemory.layers.craft.count} active craft patterns`
                          : `${craftPatterns.length} patterns learned from feedback`}
                      </div>
                    </div>
                    <button
                      onClick={clearCraftPatterns}
                      className="px-3 py-1.5 text-sm text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition"
                    >
                      Clear
                    </button>
                  </div>
                  <div className="mt-3 text-sm text-stone-600">
                    {lifetimeMemory?.layers?.craft?.topPatterns?.length
                      ? lifetimeMemory.layers.craft.topPatterns.join(" • ")
                      : "No craft directives learned yet."}
                  </div>
                </div>

                <div className="rounded-xl border border-stone-200 bg-stone-50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium text-stone-700">
                        Lifetime Layer
                      </div>
                      <div className="mt-1 text-sm text-stone-500">
                        {lifetimeMemory
                          ? `${lifetimeMemory.totalGenerations || 0} generations, ${lifetimeMemory.totalFeedback || 0} feedback items`
                          : "No data yet"}
                      </div>
                    </div>
                    <button
                      onClick={clearLifetimeMemory}
                      className="px-3 py-1.5 text-sm text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition"
                    >
                      Clear
                    </button>
                  </div>
                  <div className="mt-3 text-sm text-stone-600">
                    {lifetimeMemory?.layers?.lifetime?.topInsights?.length
                      ? lifetimeMemory.layers.lifetime.topInsights.join(" • ")
                      : "No durable lifetime insights have been derived yet."}
                  </div>
                </div>

                <div className="rounded-xl border border-stone-200 bg-stone-50 p-4">
                  <div className="font-medium text-stone-700">
                    Preference Layer
                  </div>
                  <div className="mt-1 text-sm text-stone-500">
                    Explicit author defaults that now feed prompt construction.
                  </div>
                  <div className="mt-3 space-y-1 text-sm text-stone-600">
                    <div>
                      POV:{" "}
                      {lifetimeMemory?.layers?.preference?.preferredPov ||
                        preferences.preferredPOV}
                    </div>
                    <div>
                      Tense:{" "}
                      {lifetimeMemory?.layers?.preference?.preferredTense ||
                        preferences.preferredTense}
                    </div>
                    <div>
                      Context:{" "}
                      {(
                        lifetimeMemory?.layers?.preference?.contextWindowSize ||
                        preferences.contextWindowSize
                      ).toLocaleString()}{" "}
                      chars
                    </div>
                    <div>
                      Continuity:{" "}
                      {(lifetimeMemory?.layers?.preference
                        ?.enableContinuityChecks ??
                      preferences.enableContinuityChecks)
                        ? "On"
                        : "Off"}
                    </div>
                    <div>
                      Directives:{" "}
                      {lifetimeMemory?.layers?.preference
                        ?.persistentDirectionsCount ??
                        preferences.persistentDirections
                          .split(/\n+/)
                          .map((line) => line.trim())
                          .filter(Boolean).length}
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-stone-200 bg-stone-50 p-4">
                  <div className="font-medium text-stone-700">
                    Context Layer
                  </div>
                  <div className="mt-1 text-sm text-stone-500">
                    Live scene evidence and planner state available to
                    generation.
                  </div>
                  <div className="mt-3 space-y-1 text-sm text-stone-600">
                    <div>
                      Planner:{" "}
                      {(lifetimeMemory?.layers?.context?.plannerEnabled ??
                      preferences.enablePromptPlanner)
                        ? "Enabled"
                        : "Disabled"}
                    </div>
                    <div>
                      Planner briefs:{" "}
                      {lifetimeMemory?.layers?.context?.plannerHistoryCount ||
                        0}
                    </div>
                    <div>
                      Evidence depth:{" "}
                      {lifetimeMemory?.layers?.context?.plannerEvidenceDepth ||
                        preferences.promptPlannerTopK}
                    </div>
                    <div>
                      Style samples:{" "}
                      {lifetimeMemory?.layers?.context?.styleSampleCount || 0}
                    </div>
                    <div>
                      Project memories:{" "}
                      {lifetimeMemory?.layers?.context?.projectMemoryCount ||
                        lifetimeMemory?.projectMemoryCount ||
                        0}
                    </div>
                    <div>
                      Stored events:{" "}
                      {lifetimeMemory?.layers?.context?.projectEventCount || 0}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <p className="mt-4 text-sm text-stone-500">
              The memory stack now has four explicit layers: craft directives,
              durable lifetime insights, explicit preference memory, and live
              context memory. Story continuity still comes from your chapters,
              Story Bible, and planner evidence, not hidden model state.
            </p>
          </section>

          {/* Save Button */}
          <div className="flex justify-end">
            <button
              onClick={savePreferences}
              disabled={isSaving}
              className="px-8 py-3 bg-stone-800 text-white rounded-lg hover:bg-stone-700 disabled:opacity-50 font-medium min-w-40"
            >
              {isSaving ? "Saving..." : "Save Preferences"}
            </button>
          </div>

          {/* Keyboard Shortcuts Reference */}
          <section className="env-card-soft mt-12 rounded-xl border border-stone-200 p-6">
            <h2 className="text-xl font-semibold text-stone-800 mb-4">
              Keyboard Shortcuts
            </h2>
            <div className="grid gap-3 md:grid-cols-2">
              <ShortcutItem
                keys={["Ctrl", "Enter"]}
                description="Generate at cursor"
              />
              <ShortcutItem keys={["Ctrl", "S"]} description="Save chapter" />
              <ShortcutItem
                keys={["Ctrl", "Shift", "G"]}
                description="Quick generation menu"
              />
              <ShortcutItem keys={["Ctrl", "B"]} description="Toggle bold" />
              <ShortcutItem keys={["Ctrl", "I"]} description="Toggle italic" />
              <ShortcutItem keys={["Ctrl", "Z"]} description="Undo" />
              <ShortcutItem keys={["Ctrl", "Shift", "Z"]} description="Redo" />
              <ShortcutItem
                keys={["Escape"]}
                description="Close modal / Cancel"
              />
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function ShortcutItem({
  keys,
  description,
}: {
  keys: string[];
  description: string;
}): JSX.Element {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-stone-600">{description}</span>
      <div className="flex gap-1">
        {keys.map((key, i) => (
          <span key={i}>
            <kbd className="px-2 py-1 bg-white border border-stone-300 rounded text-sm font-mono">
              {key}
            </kbd>
            {i < keys.length - 1 && (
              <span className="mx-1 text-stone-400">+</span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}
