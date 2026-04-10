# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Magnum Opus** - AI-powered novel writing assistant with autonomous chapter generation, story bible management, and multi-provider AI support.

## Development Commands

```bash
# Development (starts both frontend and backend)
npm run dev
# Frontend: http://localhost:5173
# Backend API: http://localhost:3001

# Production build and start
npm run build && npm start

# Testing
npm run test              # Run tests in watch mode
npm run test:run          # Run tests once
npm run test:services     # Run service tests only
npm run test:coverage     # Run with coverage report

# Code quality
npm run lint              # Check ESLint
npm run lint:fix          # Fix ESLint issues
npm run format            # Format with Prettier
```

## Architecture Overview

### Frontend (`src/`)

- **React 18 + TypeScript** with Vite build tooling
- **Entry point**: `src/main.tsx` mounts `App.tsx`
- **Key components**:
  - `ProjectList.tsx` - Project landing and creation
  - `Editor.tsx` - TipTap editor with chapter editing and generation
  - `AutonomousWriter.tsx` - Autonomous writing session control
  - `StoryBible.tsx` - Character and world management
  - `StyleLearning.tsx` - Writing sample analysis
  - `MetricsDashboard.tsx` - System health and token tracking
- **Shared types**: `src/types/magnumOpus.ts` - Use these for frontend type definitions
- **API client**: `src/api/client.ts` - Centralized API calls

### Backend (`server/`)

- **Express.js + TypeScript** with ES modules (`"type": "module"`)
- **Entry point**: `server/index.ts` (large file ~5K lines - currently being refactored)
- **HTTP setup**: `server/src/http/configureApp.ts` - CORS, rate limiting, request logging
- **Domain types**: `server/src/domain/types.ts` - Canonical type definitions
- **Core modules**:
  - `server/src/core/config.ts` - Runtime constants and token limits
  - `server/src/core/logger.ts` - Structured logging with redaction
  - `server/src/core/metrics.ts` - Performance tracking
  - `server/src/infrastructure/persistence.ts` - JSON file persistence
- **Routes** (registered in `server/index.ts`):
  - `server/src/routes/projects.ts` - CRUD for projects/chapters
  - `server/src/routes/generation.ts` - AI generation endpoints
  - `server/src/routes/autonomous.ts` - Autonomous writing sessions
  - `server/src/routes/storyBible.ts` - Story bible management
  - `server/src/routes/provider.ts` - AI provider configuration
  - `server/src/routes/observability.ts` - Health, logs, metrics
- **Prompt building**: `server/src/prompt/curatedPromptBuilder.ts` - Fiction prompt assembly

### Data Persistence

- **SQLite** (`server/db.ts`): Projects, chapters, version history, session snapshots
- **Transaction log**: `.novawrite-data/txlog/` - Append-only crash recovery
- **JSON files**: `.novawrite-data/` - Preferences, metrics, craft patterns, lifetime memory
- **Generated drafts**: `.novawrite-data/drafts/` - Pending autonomous content

### AI Provider Integration

Supported providers configured via environment variables:
- `groq` - Groq API (fast inference)
- `openai` - OpenAI GPT models
- `anthropic` - Claude models
- `google` - Gemini models
- `openai-compatible` - Ollama/local models

## Key Technical Details

### TypeScript Configuration

- **Frontend**: `tsconfig.json` - ES2020, React JSX, bundler module resolution
- **Backend**: `tsconfig.server.json` - Node module resolution, composite project
- **Strict mode**: Enabled with `noUnusedLocals` and `noUnusedParameters`

### Testing

- **Framework**: Vitest with v8 coverage
- **Config**: `vitest.config.ts`
- **Setup**: `tests/setup.ts`
- **Coverage thresholds**: 80% lines/functions/statements, 70% branches
- **Test files**: `tests/**/*.test.ts` or `*.spec.ts`

### Code Style

- **ESLint**: `eslint.config.mjs` - TypeScript recommended + Prettier integration
- **Rules**: No explicit `any`, warn on missing return types, allow console
- **Prettier**: Default configuration, runs via lint-staged
- **Line endings**: Files use single quotes, 2-space indentation

### Environment Variables

Create `.env` file with:
```
AI_PROVIDER=groq|openai|anthropic|google|openai-compatible
AI_MODEL=<model-name>
GROQ_API_KEY=...
OPENAI_API_KEY=...
ANTHROPIC_API_KEY=...
GOOGLE_API_KEY=...
PORT=3001
NODE_ENV=development|production
```

### Build Output

- **Frontend**: `dist/client/` (served by Express in production)
- **Backend**: `dist/server/` (TypeScript compilation)
- **Server compilation**: Uses `scripts/run-tsc.cjs` fallback due to bundled TypeScript quirks

## Working with the Codebase

### Adding New API Endpoints

1. Add route handler in appropriate `server/src/routes/*.ts` file
2. Register in `server/index.ts` (search for `register*Routes` calls)
3. Add types to `server/src/domain/types.ts` if needed
4. Add client method in `src/api/client.ts`
5. Add types to `src/types/magnumOpus.ts` for frontend use

### Database Changes

- SQLite schema is initialized in `server/db.ts` via `initializeDatabase()`
- Migrations are manual - add new table/column SQL to initialization
- Version history tracked automatically via `saveChapterVersion()`

### Autonomous Writing Flow

1. `POST /api/autonomous/start` - Creates session
2. `POST /api/autonomous/:sessionId/iterate` - Generates content
3. `GET /api/autonomous/:sessionId/stream` - SSE streaming for real-time updates
4. `POST /api/autonomous/:sessionId/accept` - Commits generated content
5. Session state tracked in memory with SQLite backup

### Important Notes

- **server/index.ts is large**: Many routes still defined inline; prefer extracting to `server/src/routes/` modules
- **Dual type definitions**: Types exist in both `server/src/domain/types.ts` and `src/types/magnumOpus.ts` - keep synchronized
- **Triple redundancy**: Transaction log + SQLite WAL + version history for chapter saves
- **Rate limiting**: Only enabled in production (`NODE_ENV=production`)
- **CORS**: Configured for localhost development in `configureApp.ts`

## Common File Locations

- **Shared types (frontend)**: `src/types/magnumOpus.ts`
- **Domain types (backend)**: `server/src/domain/types.ts`
- **API client**: `src/api/client.ts`
- **Config/constants**: `server/src/core/config.ts`
- **Logging**: `server/src/core/logger.ts`
- **Tests**: `tests/` directory with `setup.ts` for test configuration
