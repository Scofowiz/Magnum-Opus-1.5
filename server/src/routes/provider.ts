import type { Express, Request, Response } from "express";
import type { ProviderConfig, ProviderType } from "../core/types.js";
import type { CodexAuthStatus } from "../providers/codexCli.js";

interface ModelOption {
  id: string;
  name: string;
}

const DEFAULT_CODEX_MODEL = "gpt-5.1-codex";

function normalizeOllamaApiBaseUrl(baseUrl?: string): string {
  const candidate = (baseUrl || "http://localhost:11434")
    .trim()
    .replace(/\/+$/, "");
  return candidate.endsWith("/v1") ? candidate : `${candidate}/v1`;
}

function normalizeOllamaRootUrl(baseUrl?: string): string {
  return normalizeOllamaApiBaseUrl(baseUrl).replace(/\/v1$/, "");
}

function sanitizeCodexModel(model?: string): string {
  const candidate = model?.trim();
  if (!candidate) return DEFAULT_CODEX_MODEL;
  if (/\s/.test(candidate)) return DEFAULT_CODEX_MODEL;
  return candidate;
}

interface ProviderRoutesDeps {
  chatCompletion(
    systemPrompt: string,
    userMessage: string,
    options?: {
      temperature?: number;
      maxTokens?: number;
      topP?: number;
      signal?: AbortSignal;
      model?: string;
    },
  ): Promise<{ text: string; tokens: number }>;
  getProviderConfig(): ProviderConfig;
  getProviderProfile(type: ProviderType): ProviderConfig;
  getCodexAuthStatus(signal?: AbortSignal): Promise<CodexAuthStatus>;
  saveProviderConfig(config: ProviderConfig): void;
  trackRequest(endpoint: string): void;
}

async function fetchGroqModels(apiKey: string): Promise<ModelOption[]> {
  const response = await fetch("https://api.groq.com/openai/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const data = await response.json();
  if (data.error) throw new Error(data.error.message);
  return (
    data.data?.map((model: { id: string }) => ({
      id: model.id,
      name: model.id,
    })) || []
  );
}

async function fetchGoogleModels(apiKey: string): Promise<ModelOption[]> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
  );
  const data = await response.json();
  if (data.error) throw new Error(data.error.message);
  return (
    data.models
      ?.filter((model: { supportedGenerationMethods?: string[] }) =>
        model.supportedGenerationMethods?.includes("generateContent"),
      )
      ?.map((model: { name: string; displayName: string }) => ({
        id: model.name.replace("models/", ""),
        name: model.displayName,
      })) || []
  );
}

export function registerProviderRoutes(
  app: Express,
  deps: ProviderRoutesDeps,
): void {
  app.get("/api/provider", (_req: Request, res: Response) => {
    deps.trackRequest("/api/provider");
    const providerConfig = deps.getProviderConfig();

    res.json({
      type: providerConfig.type,
      model: providerConfig.model,
      baseUrl: providerConfig.baseUrl,
      hasApiKey: !!providerConfig.apiKey,
      availableProviders: [
        { type: "codex", name: "Codex (ChatGPT Login)", customModel: true },
        { type: "groq", name: "Groq (Fast Inference)", dynamicModels: true },
        { type: "google", name: "Google AI (Gemini)", dynamicModels: true },
        {
          type: "openai-compatible",
          name: "OpenAI-Compatible / Llama",
          customModel: true,
        },
        {
          type: "ollama",
          name: "Ollama (Local)",
          customModel: true,
          defaultBaseUrl: "http://localhost:11434",
        },
      ],
    });
  });

  app.get(
    "/api/provider/codex/status",
    async (_req: Request, res: Response) => {
      deps.trackRequest("/api/provider/codex/status");

      try {
        const status = await deps.getCodexAuthStatus();
        res.json(status);
      } catch (error) {
        res.status(500).json({
          available: false,
          loggedIn: false,
          message: String(error),
        });
      }
    },
  );

  app.get("/api/provider/groq/models", async (_req: Request, res: Response) => {
    deps.trackRequest("/api/provider/groq/models");
    const providerConfig = deps.getProviderConfig();
    const apiKey = providerConfig.apiKey;
    if (!apiKey) {
      return res
        .status(400)
        .json({
          error:
            "API key required - configure via Settings or use POST with apiKey in body",
        });
    }

    try {
      const models = await fetchGroqModels(apiKey);
      res.json({ models });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  app.post("/api/provider/groq/models", async (req: Request, res: Response) => {
    deps.trackRequest("/api/provider/groq/models");
    const providerConfig = deps.getProviderConfig();
    const apiKey = req.body.apiKey || providerConfig.apiKey;
    if (!apiKey) {
      return res.status(400).json({ error: "API key required" });
    }

    try {
      const models = await fetchGroqModels(apiKey);
      res.json({ models });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  app.get(
    "/api/provider/google/models",
    async (_req: Request, res: Response) => {
      deps.trackRequest("/api/provider/google/models");
      const providerConfig = deps.getProviderConfig();
      const apiKey = providerConfig.apiKey;
      if (!apiKey) {
        return res
          .status(400)
          .json({
            error:
              "API key required - configure via Settings or use POST with apiKey in body",
          });
      }

      try {
        const models = await fetchGoogleModels(apiKey);
        res.json({ models });
      } catch (error) {
        res.status(500).json({ error: String(error) });
      }
    },
  );

  app.post(
    "/api/provider/google/models",
    async (req: Request, res: Response) => {
      deps.trackRequest("/api/provider/google/models");
      const providerConfig = deps.getProviderConfig();
      const apiKey = req.body.apiKey || providerConfig.apiKey;
      if (!apiKey) {
        return res.status(400).json({ error: "API key required" });
      }

      try {
        const models = await fetchGoogleModels(apiKey);
        res.json({ models });
      } catch (error) {
        res.status(500).json({ error: String(error) });
      }
    },
  );

  app.get(
    "/api/provider/ollama/models",
    async (req: Request, res: Response) => {
      deps.trackRequest("/api/provider/ollama/models");
      const baseUrl = normalizeOllamaRootUrl(
        req.query.baseUrl as string | undefined,
      );

      try {
        const response = await fetch(`${baseUrl}/api/tags`);
        if (!response.ok) {
          const detail = await response.text();
          throw new Error(detail || `Ollama returned ${response.status}`);
        }
        const data = await response.json();
        const models =
          data.models?.map((model: { name: string }) => ({
            id: model.name,
            name: model.name,
          })) || [];
        res.json({ models });
      } catch (error) {
        res.status(500).json({ error: String(error) });
      }
    },
  );

  app.put("/api/provider", (req: Request, res: Response) => {
    deps.trackRequest("/api/provider");
    const currentProviderConfig = deps.getProviderConfig();
    const { type, apiKey, baseUrl, model } = req.body as {
      type?: ProviderType;
      apiKey?: string;
      baseUrl?: string;
      model?: string;
    };

    if (!type) {
      return res.status(400).json({ error: "Provider type is required" });
    }

    const selectedProfile = deps.getProviderProfile(type);
    const sameProvider = currentProviderConfig.type === type;
    const fallbackModel = sameProvider ? currentProviderConfig.model : "";
    const fallbackApiKey = sameProvider ? currentProviderConfig.apiKey : "";
    const fallbackBaseUrl = sameProvider
      ? currentProviderConfig.baseUrl
      : undefined;
    const resolvedModel =
      type === "codex"
        ? sanitizeCodexModel(model || selectedProfile.model || fallbackModel)
        : model || selectedProfile.model || fallbackModel;

    if (!resolvedModel) {
      return res.status(400).json({ error: "Model selection is required" });
    }

    const newConfig: ProviderConfig = {
      type,
      apiKey:
        type === "codex"
          ? ""
          : type === "ollama"
            ? ""
            : apiKey || selectedProfile.apiKey || fallbackApiKey,
      baseUrl:
        type === "codex"
          ? undefined
          : type === "ollama"
            ? normalizeOllamaApiBaseUrl(
                baseUrl || selectedProfile.baseUrl || fallbackBaseUrl,
              )
            : baseUrl || selectedProfile.baseUrl || fallbackBaseUrl,
      model: resolvedModel,
    };

    deps.saveProviderConfig(newConfig);
    const savedConfig = deps.getProviderConfig();

    res.json({
      type: savedConfig.type,
      model: savedConfig.model,
      baseUrl: savedConfig.baseUrl,
      hasApiKey: !!savedConfig.apiKey,
    });
  });

  app.post("/api/provider/test", async (_req: Request, res: Response) => {
    deps.trackRequest("/api/provider/test");
    const providerConfig = deps.getProviderConfig();

    try {
      const { text } = await deps.chatCompletion(
        "You are a helpful assistant.",
        'Say "Connection successful!" and nothing else.',
        { maxTokens: 20 },
      );

      res.json({
        success: true,
        message: text,
        provider: providerConfig.type,
        model: providerConfig.model,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: String(error),
        provider: providerConfig.type,
        model: providerConfig.model,
      });
    }
  });
}
