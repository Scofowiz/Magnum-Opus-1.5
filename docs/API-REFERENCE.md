# Magnum Opus - API Reference

**Base URL:** `http://localhost:3001` (development)

All endpoints accept and return JSON unless otherwise noted.

---

## Table of Contents

- [Health](#health)
- [Projects](#projects)
- [Chapters](#chapters)
- [Chapter Save & History](#chapter-save--history)
- [Story Bible](#story-bible)
- [Characters](#characters)
- [Generation](#generation)
- [Autonomous Writing](#autonomous-writing)
- [Style Learning](#style-learning)
- [Provider Management](#provider-management)
- [Preferences](#preferences)
- [Craft Patterns](#craft-patterns)
- [Lifetime Memory](#lifetime-memory)
- [Memory Stats](#memory-stats)
- [Cache Management](#cache-management)
- [Metrics & Logs](#metrics--logs)
- [Database Health](#database-health)

---

## Health

### GET /health

System health check.

**Response:**
```json
{
  "status": "healthy",
  "uptime": "2h 15m",
  "provider": {
    "type": "groq",
    "model": "moonshotai/kimi-k2-instruct-0905",
    "hasApiKey": true
  }
}
```

Status values: `healthy`, `degraded`, `unhealthy`

---

## Projects

### GET /api/projects

List all projects.

**Response:** Array of project objects (sorted by updated_at descending).

```json
[
  {
    "id": "uuid",
    "title": "My Novel",
    "description": "",
    "genre": "",
    "wordCount": 45000,
    "createdAt": "2026-01-15T...",
    "updatedAt": "2026-02-07T..."
  }
]
```

### POST /api/projects

Create a new project.

**Body:**
```json
{
  "title": "My Novel"
}
```

**Response:** The created project object with a generated UUID.

### GET /api/projects/:id

Get a single project with its Story Bible and chapter list.

### PUT /api/projects/:id

Update a project.

**Body:** Partial project fields to update (title, content, wordCount, storyBible, etc.)

### DELETE /api/projects/:id

Delete a project and all associated chapters, versions, and data.

---

## Chapters

### GET /api/projects/:id/chapters

List all chapters for a project, sorted by sort order.

**Response:**
```json
[
  {
    "id": "uuid",
    "title": "Chapter 1",
    "content": "<p>...</p>",
    "wordCount": 3200,
    "order": 0
  }
]
```

### POST /api/projects/:id/chapters

Create a new chapter.

**Body:**
```json
{
  "title": "Chapter 1"
}
```

### PUT /api/projects/:projectId/chapters/:chapterId

Update a chapter.

**Body:**
```json
{
  "title": "Revised Title",
  "content": "<p>Updated content</p>",
  "order": 2
}
```

### DELETE /api/projects/:projectId/chapters/:chapterId

Delete a chapter and all its version history.

### POST /api/projects/:id/cleanup-chapters

Remove empty or duplicate chapters from a project.

### POST /api/projects/:id/prepare-book-mode

Auto-create chapters from Story Bible chapter outlines if they don't already exist.

---

## Chapter Save & History

### POST /api/chapters/:chapterId/save

Ironclad save with triple redundancy (transaction log + SQLite WAL + version history).

**Body:**
```json
{
  "content": "<p>Chapter content HTML</p>",
  "trigger": "sentence_end"
}
```

Trigger values: `sentence_end`, `paragraph`, `word_boundary`, `idle`, `manual`, `generation`, `paste`, `autonomous`

### GET /api/chapters/:chapterId/history

Get version history for a chapter.

**Query params:**
- `limit` (optional, default: 100)

**Response:**
```json
[
  {
    "id": 42,
    "chapter_id": "uuid",
    "content": "<p>...</p>",
    "word_count": 3200,
    "trigger": "sentence_end",
    "created_at": "2026-02-07T10:30:00"
  }
]
```

### POST /api/chapters/:chapterId/restore/:versionId

Restore a chapter to a specific version. Creates a new version entry (non-destructive).

---

## Story Bible

### GET /api/projects/:id/story-bible

Get the Story Bible for a project.

**Response:**
```json
{
  "storyBible": {
    "premise": {
      "logline": "...",
      "synopsis": "...",
      "themes": ["..."],
      "tone": "...",
      "genre": "..."
    },
    "characters": [...],
    "world": {
      "setting": "...",
      "timePeriod": "...",
      "locations": [...],
      "rules": [...]
    },
    "plotStructure": {
      "acts": [...],
      "plotThreads": [...]
    },
    "chapterOutlines": [...],
    "styleDirectives": {
      "pov": "...",
      "tense": "...",
      "proseStyle": "...",
      "dialogueStyle": "..."
    }
  }
}
```

### PUT /api/projects/:id/story-bible

Update the Story Bible.

**Body:** Full Story Bible object (replaces entirely).

### POST /api/projects/:id/story-bible/extract

Extract Story Bible elements from existing chapter content using AI.

**Body:**
```json
{
  "content": "Full manuscript text..."
}
```

**Response:** Extracted Story Bible object.

### POST /api/projects/:id/story-bible/extract-iterative

Multi-pass iterative extraction for large manuscripts. Performs multiple AI passes to extract characters, locations, themes, and plot threads, then enriches and deduplicates.

**Body:**
```json
{
  "content": "Full manuscript text..."
}
```

---

## Characters

### POST /api/projects/:id/characters

Add a character to the Story Bible.

**Body:**
```json
{
  "name": "Character Name",
  "role": "protagonist",
  "description": "Physical and personality description",
  "backstory": "Character history",
  "motivation": "What drives them",
  "fears": ["fear1", "fear2"],
  "flaw": "Fatal flaw",
  "arc": "Character arc description",
  "voice": {
    "vocabulary": "Academic, formal",
    "speechPatterns": ["Uses long sentences"],
    "catchphrases": ["Indeed"]
  },
  "cognitiveFilter": {
    "primaryMode": "analytical",
    "internalLanguage": "Clinical, precise",
    "blindSpot": "Emotional cues",
    "repeatingThoughtLoop": "There must be a logical explanation",
    "forbiddenWords": ["feel", "sense"],
    "signatureThoughts": ["Insufficient data"]
  }
}
```

### PUT /api/projects/:projectId/characters/:characterId

Update an existing character.

### DELETE /api/projects/:projectId/characters/:characterId

Remove a character from the Story Bible.

---

## Generation

### POST /api/generate

Generate content at the cursor position.

**Body:**
```json
{
  "projectId": "uuid",
  "chapterId": "uuid",
  "prompt": "Continue the scene with rising tension",
  "targetWords": 500,
  "contextWindow": {
    "before": "<p>Text before cursor...</p>",
    "after": "<p>Text after cursor...</p>",
    "cursorPosition": 1234
  }
}
```

**Response:**
```json
{
  "text": "Generated prose...",
  "wordCount": 487,
  "qualityScore": 8.2,
  "metadata": {
    "tokens": 1250,
    "latencyMs": 3400,
    "attempts": 1
  }
}
```

For nonfiction, prefix the prompt with `[NONFICTION]`.

### POST /api/generate/retry

Regenerate content with the same context. Accepts the same body as `/api/generate`.

---

## Autonomous Writing

### POST /api/autonomous/start

Start an autonomous writing session.

**Body (Chapter Mode):**
```json
{
  "projectId": "uuid",
  "chapterId": "uuid",
  "targetWords": 5000,
  "plotPointsToHit": ["The protagonist discovers the letter", "First confrontation"],
  "actNumber": 2,
  "selectedThreads": ["thread-id-1"],
  "mode": "chapter"
}
```

**Body (Book Mode):**
```json
{
  "projectId": "uuid",
  "chaptersToWrite": ["chapter-id-1", "chapter-id-2"],
  "wordsPerChapter": 5000,
  "mode": "book"
}
```

**Response:** Session object with session ID.

### GET /api/autonomous/:sessionId

Get the current state of an autonomous session.

### GET /api/autonomous

List all active autonomous sessions.

### POST /api/autonomous/:sessionId/iterate

Trigger the next iteration of an autonomous session (~500 words).

**Response:** Updated session with new content, word counts, narrative state, and plot point status.

### GET /api/autonomous/:sessionId/stream

Server-Sent Events (SSE) stream for real-time generation progress.

### POST /api/autonomous/:sessionId/accept

Accept the pending draft content and merge it into the chapter.

**Body:**
```json
{
  "content": "<p>HTML content to merge</p>"
}
```

### POST /api/autonomous/:sessionId/pause

Pause a running session.

### POST /api/autonomous/:sessionId/resume

Resume a paused session.

### POST /api/autonomous/:sessionId/stop

Stop and finalize a session.

---

## Style Learning

### GET /api/style

Get the current style fingerprint.

**Response:**
```json
{
  "fingerprint": {
    "vocabularyComplexity": 0.72,
    "avgSentenceLength": 18.5,
    "dialogueRatio": 0.35,
    "showVsTellRatio": 0.8,
    "passiveVoiceRatio": 0.05,
    "adverbDensity": 0.02,
    "metaphorFrequency": 0.15,
    "toneDescriptor": "atmospheric and terse",
    "strengthAreas": ["dialogue", "pacing"],
    "improvementAreas": ["description depth"],
    "sampleCount": 3,
    "signaturePhrases": ["..."],
    "dialogueTags": { "preferred": ["said"], "avoided": ["exclaimed"] },
    "verbChoices": { "movement": [...], "speech": [...], "emotion": [...] },
    "sentencePatterns": [...],
    "paragraphOpeners": [...],
    "sceneOpenings": [...],
    "tensionTechniques": [...],
    "exemplars": [...],
    "humorStyle": "dry, understated",
    "emotionalPalette": ["dread", "quiet hope"],
    "avoidances": [...],
    "proseTechniques": [...]
  }
}
```

### POST /api/style/samples

Upload a writing sample for analysis.

**Body:**
```json
{
  "sample": "Your writing sample text (500-50,000 characters)..."
}
```

**Response:** Updated fingerprint.

### DELETE /api/style

Reset the style fingerprint entirely.

### POST /api/style/feedback

Submit feedback on generated content.

**Body:**
```json
{
  "generatedText": "The AI-generated text...",
  "feedback": "Too flowery, too many adverbs",
  "reason": "style_mismatch"
}
```

---

## Provider Management

### GET /api/provider

Get current provider configuration (API key masked).

**Response:**
```json
{
  "type": "groq",
  "model": "moonshotai/kimi-k2-instruct-0905",
  "hasApiKey": true,
  "availableProviders": [
    { "type": "groq", "name": "Groq", "dynamicModels": true },
    { "type": "openai", "name": "OpenAI" },
    { "type": "anthropic", "name": "Anthropic Claude" },
    { "type": "google", "name": "Google Gemini", "dynamicModels": true },
    { "type": "ollama", "name": "Ollama (Local)", "dynamicModels": true },
    { "type": "openai-compatible", "name": "OpenAI Compatible", "customModel": true }
  ]
}
```

### PUT /api/provider

Update provider configuration.

**Body:**
```json
{
  "type": "groq",
  "apiKey": "gsk_...",
  "model": "moonshotai/kimi-k2-instruct-0905"
}
```

### POST /api/provider/test

Test connection to a provider.

**Body:** Same as PUT /api/provider.

**Response:**
```json
{
  "success": true,
  "message": "Connection successful",
  "model": "moonshotai/kimi-k2-instruct-0905"
}
```

### GET /api/provider/groq/models

Fetch available models from Groq.

### POST /api/provider/groq/models

Fetch models using a specific API key.

### GET /api/provider/google/models

Fetch available models from Google.

### POST /api/provider/google/models

Fetch models using a specific API key.

### GET /api/provider/ollama/models

Fetch available models from a local Ollama instance.

**Query params:**
- `baseUrl` (optional, default: `http://localhost:11434`)

---

## Preferences

### GET /api/preferences

Get user preferences.

**Response:**
```json
{
  "defaultModel": "moonshotai/kimi-k2-instruct-0905",
  "temperature": 0.8,
  "maxTokensPerGeneration": 2000,
  "autoSaveInterval": 30000,
  "showQualityScores": true,
  "minQualityThreshold": 7,
  "enableContinuityChecks": true,
  "preferredPOV": "third-limited",
  "preferredTense": "past",
  "contextWindowSize": 10000
}
```

### PUT /api/preferences

Update user preferences.

**Body:** Partial preferences object.

---

## Craft Patterns

### GET /api/craft-patterns

List all craft patterns.

### POST /api/craft-patterns

Add a craft pattern.

**Body:**
```json
{
  "category": "dialogue",
  "pattern": "Subtext through misdirection",
  "example": "She said she was fine. Her hands told a different story.",
  "effectiveness": 8
}
```

### DELETE /api/craft-patterns

Clear all craft patterns.

---

## Lifetime Memory

### GET /api/lifetime-memory

Get lifetime memory contents (insights, writing history, feedback history).

### DELETE /api/lifetime-memory

Clear lifetime memory.

---

## Memory Stats

### GET /api/memory/stats

Get sizes and counts for all data stores.

**Response:**
```json
{
  "projects": { "count": 3, "totalWords": 125000 },
  "chapters": { "count": 27 },
  "versions": { "count": 4500 },
  "craftPatterns": { "count": 15 },
  "lifetimeMemory": {
    "insights": 8,
    "writingHistory": 45,
    "feedbackHistory": 12
  },
  "styleFingerprint": { "sampleCount": 5 }
}
```

---

## Cache Management

### GET /api/cache/stats

Get current cache statistics.

**Response:**
```json
{
  "storyBible": { "entries": 2 },
  "narrativeState": { "entries": 1 },
  "qualityScores": { "entries": 15 },
  "continuityIndex": { "entries": 2 },
  "styleAnalysis": { "entries": 3 }
}
```

### POST /api/cache/clear

Clear caches.

**Body:**
```json
{
  "caches": ["storyBible", "qualityScores"]
}
```

Omit `caches` to clear all.

---

## Metrics & Logs

### GET /api/metrics

Get system metrics.

**Response:**
```json
{
  "health": {
    "status": "healthy",
    "successRate": 0.98,
    "avgLatencyMs": 2300,
    "uptimeMs": 7200000,
    "uptimeFormatted": "2h 0m"
  },
  "tokenUsage": {
    "total": 1250000,
    "today": 45000,
    "byEndpoint": { "/api/generate": 800000 },
    "last7Days": { "2026-02-07": 45000 }
  },
  "qualityScores": {
    "average": 7.8,
    "trend": "improving",
    "recent": [8.1, 7.5, 8.3],
    "totalScored": 150
  },
  "extraction": {
    "totalIterations": 5,
    "recent": [...]
  },
  "requests": {
    "total": 3500,
    "byEndpoint": { "/api/generate": 500 }
  },
  "startedAt": "2026-02-07T08:00:00Z"
}
```

### GET /api/logs

Get recent server logs.

**Query params:**
- `limit` (optional, default: 50)

**Response:**
```json
{
  "logs": [
    {
      "timestamp": "2026-02-07T10:30:00Z",
      "level": "info",
      "context": "server",
      "message": "Generation complete",
      "data": { "tokens": 1200 }
    }
  ]
}
```

### GET /api/logs/file/:date

Get the log file for a specific date.

**Params:**
- `date`: `YYYY-MM-DD` format

---

## Database Health

### GET /api/db/health

Check database configuration.

**Response:**
```json
{
  "ok": true,
  "walMode": true,
  "syncMode": "FULL"
}
```

`ok` is `true` only when WAL mode is active and synchronous mode is FULL.
