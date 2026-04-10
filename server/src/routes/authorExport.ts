import type { Express, Request, Response } from "express";
import type { AuthorDossier, ExportConfig } from "../domain/authorExport.js";
import { loadData, saveData } from "../infrastructure/persistence.js";
import { createLogger } from "../core/logger.js";
import { DEFAULT_EXPORT_CONFIGS } from "../domain/authorExport.js";

const logger = createLogger("author-export");
const AUTHOR_PROFILE_FILE = "author-profile.json";
const EXPORT_CONFIGS_FILE = "export-configs.json";

interface AuthorExportRouteDeps {
  trackRequest(endpoint: string): void;
}

export function registerAuthorExportRoutes(
  app: Express,
  deps: AuthorExportRouteDeps,
): void {
  // Get author profile
  app.get("/api/author-profile", (_req: Request, res: Response) => {
    deps.trackRequest("/api/author-profile");
    const profile = loadData<AuthorDossier | null>(AUTHOR_PROFILE_FILE, null);
    res.json(profile);
  });

  // Save author profile
  app.put("/api/author-profile", (req: Request, res: Response) => {
    deps.trackRequest("/api/author-profile");
    const profile: AuthorDossier = {
      ...req.body,
      updatedAt: new Date().toISOString(),
    };
    saveData(AUTHOR_PROFILE_FILE, profile);
    logger.info("Author profile saved");
    res.json(profile);
  });

  // Get export configs
  app.get("/api/export-configs", (_req: Request, res: Response) => {
    deps.trackRequest("/api/export-configs");
    const userConfigs = loadData<ExportConfig[]>(EXPORT_CONFIGS_FILE, []);

    // Merge with defaults, ensuring we always have presets
    const allConfigs = [...DEFAULT_EXPORT_CONFIGS];

    // Add user configs that aren't presets
    userConfigs.forEach((config) => {
      if (!config.isPreset) {
        const existingIndex = allConfigs.findIndex((c) => c.id === config.id);
        if (existingIndex >= 0) {
          allConfigs[existingIndex] = config;
        } else {
          allConfigs.push(config);
        }
      }
    });

    res.json(allConfigs);
  });

  // Create new export config
  app.post("/api/export-configs", (req: Request, res: Response) => {
    deps.trackRequest("/api/export-configs");
    const userConfigs = loadData<ExportConfig[]>(EXPORT_CONFIGS_FILE, []);

    const newConfig: ExportConfig = {
      ...req.body,
      id: crypto.randomUUID(),
      isPreset: false,
      isDefault: false,
    };

    // Check if this should be the new default
    if (newConfig.isDefault) {
      userConfigs.forEach((c) => (c.isDefault = false));
    }

    userConfigs.push(newConfig);
    saveData(EXPORT_CONFIGS_FILE, userConfigs);
    logger.info("Export config created", { configId: newConfig.id });
    res.json(newConfig);
  });

  // Update export config
  app.put("/api/export-configs/:id", (req: Request, res: Response) => {
    deps.trackRequest("/api/export-configs/:id");
    const { id } = req.params;
    const userConfigs = loadData<ExportConfig[]>(EXPORT_CONFIGS_FILE, []);

    const index = userConfigs.findIndex((c) => c.id === id);
    if (index === -1) {
      res.status(404).json({ error: "Config not found" });
      return;
    }

    // Don't allow updating presets
    if (userConfigs[index].isPreset) {
      res.status(403).json({ error: "Cannot modify preset configs" });
      return;
    }

    const updatedConfig: ExportConfig = {
      ...req.body,
      id,
      isPreset: false,
    };

    // Handle default flag
    if (updatedConfig.isDefault) {
      userConfigs.forEach((c) => (c.isDefault = false));
    }

    userConfigs[index] = updatedConfig;
    saveData(EXPORT_CONFIGS_FILE, userConfigs);
    logger.info("Export config updated", { configId: id });
    res.json(updatedConfig);
  });

  // Delete export config
  app.delete("/api/export-configs/:id", (req: Request, res: Response) => {
    deps.trackRequest("/api/export-configs/:id");
    const { id } = req.params;
    const userConfigs = loadData<ExportConfig[]>(EXPORT_CONFIGS_FILE, []);

    const index = userConfigs.findIndex((c) => c.id === id);
    if (index === -1) {
      res.status(404).json({ error: "Config not found" });
      return;
    }

    // Don't allow deleting presets
    if (userConfigs[index].isPreset) {
      res.status(403).json({ error: "Cannot delete preset configs" });
      return;
    }

    userConfigs.splice(index, 1);
    saveData(EXPORT_CONFIGS_FILE, userConfigs);
    logger.info("Export config deleted", { configId: id });
    res.json({ deleted: true });
  });

  // Set default export config
  app.post("/api/export-configs/:id/default", (req: Request, res: Response) => {
    deps.trackRequest("/api/export-configs/:id/default");
    const { id } = req.params;
    const userConfigs = loadData<ExportConfig[]>(EXPORT_CONFIGS_FILE, []);

    userConfigs.forEach((c) => {
      c.isDefault = c.id === id;
    });

    saveData(EXPORT_CONFIGS_FILE, userConfigs);
    logger.info("Default export config set", { configId: id });
    res.json({ success: true });
  });
}
