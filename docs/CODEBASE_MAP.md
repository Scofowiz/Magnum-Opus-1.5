# Magnum Opus Codebase Map

This map reflects the live runtime in this repository as of March 10, 2026.

## Current Hotspots

- `server/index.ts` is still the largest operational risk. It has been reduced from over 6,000 lines to roughly 5,200 lines, but it still owns generation flow, prompt planning, story bible extraction, autonomous session management, and startup logic.
- Prompt assembly has been partially extracted, but not route ownership. The live prompt path now uses a curated builder to select chapter-relevant story data instead of dumping the full story bible on every generation call, yet the calling flows still live in `server/index.ts`.
- The backend had duplicate infrastructure implementations. The live server now uses the shared modules under `server/src/core` and `server/src/infrastructure` for config, logging, metrics, and JSON persistence, but route logic is still monolithic.
- The frontend duplicates project and story-bible interfaces across `App.tsx`, `Editor.tsx`, `AutonomousWriter.tsx`, and `StoryBible.tsx`. A shared frontend type layer is still needed.
- The repository had no `.gitignore` in the new standalone Git history. Runtime data, `node_modules`, and build output are now ignored.
- The copied dependency tree is still imperfect: the bundled TypeScript package is missing `node_modules/typescript/lib/_tsc.js`, so the repo now uses `scripts/run-tsc.cjs` as a durable fallback entrypoint for server compilation during `npm run build`.

## Runtime Overview

### Frontend

- `src/main.tsx`: React entrypoint, mounts `App`.
- `src/App.tsx`: top-level state shell for project list, editor, autonomous writer, story bible, style learning, metrics, and settings.
- `src/components/ProjectList.tsx`: project landing page and project creation modal.
- `src/components/Editor.tsx`: TipTap editor, ironclad chapter save flow, generation, retry, and export actions.
- `src/components/AutonomousWriter.tsx`: autonomous writing session lifecycle, chapter or book mode, accept or reject flow, progress logging.
- `src/components/StoryBible.tsx`: story bible editor, extraction, iterative extraction, character management, plot thread editing.
- `src/components/StyleLearning.tsx`: writing sample upload and style fingerprint display.
- `src/components/MetricsDashboard.tsx`: system health, token usage, quality trend, and recent logs.
- `src/components/Settings.tsx`: provider config, model discovery, preferences, craft patterns, and lifetime memory controls.
- `src/utils/exportDocument.ts`: browser export path for `docx`, `pdf`, `txt`, `md`, and `html`.

### Backend

- `server/index.ts`: live Express server, request logging middleware, route registration, AI orchestration, caching, story bible extraction, quality scoring, continuity checks, autonomous session flow, and startup or shutdown.
- `server/db.ts`: SQLite persistence for projects, chapters, chapter version history, session snapshots, and append-only transaction log replay.
- `server/src/core/config.ts`: runtime constants and token limits used by the live backend.
- `server/src/core/logger.ts`: structured logger with redaction, in-memory buffer, and file-backed log persistence.
- `server/src/core/metrics.ts`: metrics lifecycle, persistence hook, latency or token or quality tracking, and derived metrics access.
- `server/src/infrastructure/persistence.ts`: JSON file persistence with backups and atomic write behavior.
- `server/src/http/configureApp.ts`: Express HTTP setup for CORS, request logging, JSON parsing, and API rate limiting.
- `server/src/prompt/curatedPromptBuilder.ts`: curated fiction prompt assembly for manual generation and autonomous writing; selects active cast, plot threads, world rules, continuity anchors, and compact style guardrails.
- `server/src/routes/provider.ts`: provider configuration and model discovery routes.
- `server/src/routes/observability.ts`: health, logs, and metrics routes.
- `server/src/utils/extractJson.ts`: JSON fence stripping and repair logic for model responses.

### Sidecar Or Unwired Modules

- `server/anti-averaging.ts`: standalone anti-averaging engine, not wired into `server/index.ts`.
- `server/sona-learning.ts`: SONA (Self-Optimizing Neural Architecture) learning engine; integrated into generation flow via `server/src/routes/generation.ts` for pattern enhancement and learning.
- `server/src/core/types.ts`: broad domain type layer; only selected types are used by the live runtime today.
- `src/cli/hooks/index.ts`: hook registry and CLI-oriented orchestration layer, not wired into the React app.
- `src/integration/adr-001-integration-architecture.ts`: architecture reference encoded as TypeScript, not runtime logic.
- `setup/server.ts`: standalone setup wizard server on port `3002`.

## Backend API Surface

### Provider And Health

- `GET /api/provider`
- `GET|POST /api/provider/groq/models`
- `GET|POST /api/provider/google/models`
- `GET /api/provider/ollama/models`
- `PUT /api/provider`
- `POST /api/provider/test`
- `GET /health`

### Generation And Prompt Planning

- `POST /api/generate`
- `POST /api/generate/retry`
- `POST /api/prompt-planner/scene-pack`
- `GET /api/prompt-planner/history`

Prompt path notes:
- `buildScenePromptPlan(...)` in `server/index.ts` still ranks evidence and builds the planner directive.
- `buildGenerationContext(...)` in `server/index.ts` now delegates to `server/src/prompt/curatedPromptBuilder.ts`.
- Autonomous iterate and stream now feed plain-text chapter context plus selected threads and mandatory beats into the curated prompt builder instead of misusing `contextAfter` as a future-story dump.

### Projects And Chapters

- `GET|POST /api/projects`
- `GET|PUT|DELETE /api/projects/:id`
- `GET|POST /api/projects/:id/chapters`
- `PUT|DELETE /api/projects/:projectId/chapters/:chapterId`
- `POST /api/projects/:id/cleanup-chapters`
- `POST /api/projects/:id/prepare-book-mode`

### Save, History, And DB Health

- `POST /api/chapters/:chapterId/save`
- `GET /api/chapters/:chapterId/history`
- `POST /api/chapters/:chapterId/restore/:versionId`
- `GET /api/db/health`

### Story Bible And Characters

- `GET|PUT /api/projects/:id/story-bible`
- `POST /api/projects/:id/story-bible/extract`
- `POST /api/projects/:id/story-bible/extract-iterative`
- `POST /api/projects/:id/characters`
- `PUT|DELETE /api/projects/:projectId/characters/:characterId`

### Style, Preferences, Memory, Metrics

- `GET /api/style`
- `POST /api/style/samples`
- `DELETE /api/style`
- `POST /api/style/feedback`
- `GET /api/cache/stats`
- `POST /api/cache/clear`
- `GET|PUT /api/preferences`
- `GET|POST|DELETE /api/craft-patterns`
- `GET|DELETE /api/lifetime-memory`
- `GET /api/memory/stats`
- `GET /api/logs`
- `GET /api/logs/file/:date`
- `GET /api/metrics`

### Autonomous Writer

- `POST /api/autonomous/start`
- `GET /api/autonomous`
- `GET /api/autonomous/:sessionId`
- `POST /api/autonomous/:sessionId/iterate`
- `GET /api/autonomous/:sessionId/stream`
- `POST /api/autonomous/:sessionId/accept`
- `POST /api/autonomous/:sessionId/pause`
- `POST /api/autonomous/:sessionId/resume`
- `POST /api/autonomous/:sessionId/stop`

## Persistence Model

- `.novawrite-data/projects.json`: in-memory project map persisted to JSON.
- `.novawrite-data/preferences.json`: user generation and UI preferences.
- `.novawrite-data/provider-config.json`: selected provider and model configuration.
- `.novawrite-data/craft-patterns.json`: learned craft patterns.
- `.novawrite-data/lifetime-memory.json`: generation history and feedback memory.
- `.novawrite-data/scene-prompt-plans.json`: prompt planner history when present.
- `.novawrite-data/sessions.json`: autonomous session state.
- `.novawrite-data/metrics.json`: request, latency, token, quality, and extraction metrics.
- `.novawrite-data/drafts/`: accepted or pending autonomous HTML drafts.
- `.novawrite-data/logs/`: structured daily log files.
- `.novawrite-data/novawrite.db`: SQLite store for projects, chapters, versions, and snapshots.
- `.novawrite-data/txlog/`: append-only chapter transaction logs.

## Recommended Next Refactor Passes

- Continue splitting `server/index.ts` by route domain into `generation`, `projects`, `story-bible`, and `autonomous` route modules.
- Extract the shared backend domain types actually used by the live runtime into a narrower `server/src/domain` layer.
- Create `src/types/magnumOpus.ts` and import shared `Project`, `Chapter`, `StoryBible`, and character types across the frontend.
- Replace direct `fetch` calls with a thin `src/api/client.ts` layer so endpoint shapes live in one place.
- Rebuild `node_modules` with a clean `npm install` before trusting backend type-check results.
