/**
 * Magnum Opus Setup Wizard Server
 *
 * Standalone server for first-time setup. Runs independently of main app.
 * Once setup is complete, user runs the main app with `npm run dev`.
 */

import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3002;

// Data directory - same as main app
const DATA_DIR = path.join(process.cwd(), ".novawrite-data");
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

app.use(cors());
app.use(express.json());

// Serve the setup wizard HTML
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "wizard.html"));
});

// Get current provider config
app.get("/api/provider", (req, res) => {
  const configPath = path.join(DATA_DIR, "provider-config.json");

  if (fs.existsSync(configPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      // Don't expose full API key
      res.json({
        provider: config.provider,
        apiKey: config.apiKey ? "***configured***" : null,
        model: config.model,
        baseUrl: config.baseUrl,
      });
    } catch {
      res.json({ provider: null });
    }
  } else {
    res.json({ provider: null });
  }
});

// Save provider config from setup wizard
app.post("/api/setup/save", (req, res) => {
  const { provider, apiKey, baseUrl, model } = req.body;

  if (!provider) {
    return res.status(400).json({ error: "Provider is required" });
  }

  // Build the config object matching main app format
  const config: Record<string, string> = {
    provider,
    model: model || getDefaultModel(provider),
  };

  // Set the appropriate API key field
  switch (provider) {
    case "groq":
      config.apiKey = apiKey;
      break;
    case "openai":
      config.apiKey = apiKey;
      break;
    case "openai-compatible":
      config.apiKey = apiKey || "";
      config.baseUrl = baseUrl;
      break;
  }

  // Save to the data directory
  const configPath = path.join(DATA_DIR, "provider-config.json");
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

  console.log(`✓ Saved ${provider} configuration`);
  res.json({ success: true, provider, model: config.model });
});

// Test the provider connection
app.post("/api/provider", async (req, res) => {
  const configPath = path.join(DATA_DIR, "provider-config.json");

  if (!fs.existsSync(configPath)) {
    return res.status(400).json({ error: "No provider configured" });
  }

  const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));

  try {
    let testUrl: string;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    switch (config.provider) {
      case "groq":
        testUrl = "https://api.groq.com/openai/v1/models";
        headers["Authorization"] = `Bearer ${config.apiKey}`;
        break;
      case "openai":
        testUrl = "https://api.openai.com/v1/models";
        headers["Authorization"] = `Bearer ${config.apiKey}`;
        break;
      case "openai-compatible":
        testUrl = `${config.baseUrl}/models`;
        if (config.apiKey) {
          headers["Authorization"] = `Bearer ${config.apiKey}`;
        }
        break;
      default:
        return res.status(400).json({ error: "Unknown provider" });
    }

    const response = await fetch(testUrl, { headers });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`API returned ${response.status}: ${text.slice(0, 100)}`);
    }

    res.json({ success: true, message: "Connection successful" });
  } catch (error) {
    console.error("Connection test failed:", error);
    res.status(400).json({
      error: error instanceof Error ? error.message : "Connection failed",
    });
  }
});

function getDefaultModel(provider: string): string {
  switch (provider) {
    case "groq":
      return "llama-3.3-70b-versatile";
    case "openai":
      return "gpt-4o";
    case "openai-compatible":
      return "llama3.1:8b";
    default:
      return "";
  }
}

app.listen(PORT, () => {
  console.log("");
  console.log("╔──────────────────────────────────────────────────────────╗");
  console.log("│███╗   ███╗ █████╗  ██████╗ ███╗   ██╗██╗   ██╗███╗   ███╗│");
  console.log("│████╗ ████║██╔══██╗██╔════╝ ████╗  ██║██║   ██║████╗ ████║│");
  console.log("│██╔████╔██║███████║██║  ███╗██╔██╗ ██║██║   ██║██╔████╔██║│");
  console.log("│██║╚██╔╝██║██╔══██║██║   ██║██║╚██╗██║██║   ██║██║╚██╔╝██║│");
  console.log("│██║ ╚═╝ ██║██║  ██║╚██████╔╝██║ ╚████║╚██████╔╝██║ ╚═╝ ██║│");
  console.log("│╚═╝     ╚═╝╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═══╝ ╚═════╝ ╚═╝     ╚═╝│");
  console.log("│ ██████╗ ██████╗ ██╗   ██╗███████╗                        │");
  console.log("│██╔═══██╗██╔══██╗██║   ██║██╔════╝                        │");
  console.log("│██║   ██║██████╔╝██║   ██║███████╗                        │");
  console.log("│██║   ██║██╔═══╝ ██║   ██║╚════██║                        │");
  console.log("│╚██████╔╝██║     ╚██████╔╝███████║                        │");
  console.log("│ ╚═════╝ ╚═╝      ╚═════╝ ╚══════╝                        │");
  console.log("│                                 Slayer of the blank page.│");
  console.log("╚──────────────────────────────────────────────────────────╝");
  console.log("");
  console.log(`Open: http://localhost:${PORT}`);
  console.log("Complete setup, then run: npm run dev");
  console.log("");
});
