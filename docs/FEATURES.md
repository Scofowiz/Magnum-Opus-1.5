# Magnum Opus - Complete Feature Documentation

## Table of Contents

- [Rich Text Editor](#rich-text-editor)
- [Autonomous Writing Engine](#autonomous-writing-engine)
- [Story Bible Management](#story-bible-management)
- [Character System](#character-system)
- [Style Learning & Fingerprinting](#style-learning--fingerprinting)
- [Five-Pass Continuity Checking](#five-pass-continuity-checking)
- [Bible Auto-Population](#bible-auto-population)
- [Four-Layer Memory Architecture](#four-layer-memory-architecture)
- [Triple Redundant Save System](#triple-redundant-save-system)
- [Multi-Provider AI (BYOK)](#multi-provider-ai-byok)
- [Document Export](#document-export)
- [Metrics Dashboard](#metrics-dashboard)
- [Nonfiction Mode](#nonfiction-mode)
- [Bidirectional Context Window](#bidirectional-context-window)
- [Quality Scoring & Auto-Regeneration](#quality-scoring--auto-regeneration)
- [Caching Layer](#caching-layer)
- [Structured Logging](#structured-logging)
- [Session Management](#session-management)
- [Draft Persistence](#draft-persistence)
- [Database Health Monitoring](#database-health-monitoring)

---

## Rich Text Editor

The editor is built on TipTap (ProseMirror) and provides a full rich-text writing experience.

**Capabilities:**
- Bold, italic, headings, and block formatting via TipTap StarterKit
- Placeholder text when the editor is empty
- Chapter sidebar for multi-chapter navigation
- Add, rename, reorder, and delete chapters
- AI generation panel integrated directly into the editor
- Configurable target word count per generation (100-5,000 words)
- Inline prompt field for directing AI generation
- Draft review workflow: generated content appears as a pending draft that you accept or reject before it enters your manuscript
- Auto-accept toggle to skip the review step

**Auto-Save System:**
- Intelligent save triggers detect sentence endings (`.` `!` `?`), paragraph breaks, word boundaries, and paste events
- Each trigger fires an ironclad save through the triple redundancy pipeline
- Idle saves fire after 2 seconds of inactivity as a fallback
- Visual indicator shows `saved`, `saving`, or `unsaved` status in real time

---

## Autonomous Writing Engine

The autonomous writer generates full chapters or entire books with minimal intervention.

**Chapter Mode:**
- Select a target chapter and set word count (up to 5,000 words)
- Choose which plot points the chapter should hit
- Select which plot threads should be active
- Select an act number for structural context
- AI generates ~500 words per iteration, auto-iterating until the target is reached
- Each iteration receives the full Story Bible context plus all previously generated content for that session
- Narrative state tracking (time of day, location, POV character, mood) persists across iterations
- Real-time progress display showing words generated, iterations completed, and plot points hit

**Book Mode:**
- Select multiple chapters and set a per-chapter word count
- The engine writes each chapter sequentially, auto-advancing when one completes
- Book-level progress tracking shows current chapter, total chapters, and aggregate word count
- Chapter outlines from the Story Bible feed each chapter's beats and characters automatically

**Session Controls:**
- Pause: halts iteration without losing progress
- Resume: picks up where it left off
- Stop: ends the session and finalizes all generated content
- Auto-iterate toggle: when off, you must manually trigger each iteration
- Draft review: generated content goes to a pending queue; accept or reject before it merges into the chapter
- Auto-accept toggle: bypasses draft review and writes directly into the chapter

**Error Handling:**
- Automatic retry (up to 3 attempts) on transient API failures
- Session snapshots saved to SQLite for crash recovery
- Draft content saved to disk independently of the database

---

## Story Bible Management

The Story Bible is the central source of truth for your entire novel.

**Premise:**
- Logline: one-sentence pitch
- Synopsis: expanded summary
- Themes: list of thematic elements
- Tone: overall emotional register
- Genre: primary genre classification

**World Building:**
- Setting description
- Time period
- Named locations with description and narrative significance
- World rules (magic systems, physics, social rules, etc.)

**Plot Structure:**
- Acts: numbered acts with name, description, key events, and optional chapter ranges
- Plot threads: individual storylines with type (main, subplot, character-arc, mystery, romance), status (active, resolved, dormant, setup), tension level, introduced/resolved chapter numbers, related threads, next milestone, and key beats
- Chapter outlines: per-chapter structure with title, summary, beats, characters, location, and timeframe

**Style Directives:**
- Point of view (first person, third limited, third omniscient, etc.)
- Tense (past, present)
- Prose style description
- Dialogue style description

**Auto-Extraction:**
- Paste or import an existing manuscript and the AI extracts characters, locations, plot threads, and themes automatically
- Iterative multi-pass extraction for large manuscripts (up to ~200k tokens of input)
- Enrichment pass adds backstory and relationships to auto-extracted characters
- Deduplication prevents adding entities that already exist in the bible

---

## Character System

Characters are first-class entities with deep profiling.

**Core Fields:**
- Name, nicknames, role (protagonist, antagonist, supporting, minor)
- Physical description, backstory, motivation, fears, flaw, character arc
- Spoiler flags: mark backstory as unrevealed so continuity checks do not leak future plot points

**Voice Profile:**
- Vocabulary level description
- Speech patterns (list of characteristic patterns)
- Catchphrases

**Cognitive Filter (per character):**
- Primary mode: analytical, emotional, instinctive, ritualistic, detached, or sensory
- Internal language: how the character's thoughts are expressed
- Blind spot: what the character fails to notice
- Repeating thought loop: a recurring internal refrain
- Forbidden words: terms this character would never think or say
- Signature thoughts: distinctive internal phrases

When the autonomous writer generates in a POV character's voice, the cognitive filter shapes their internal monologue. The continuity checker (voice consistency pass) flags any violations.

**Relationships:**
- Character-to-character links with type and description
- Used by the relationship state continuity check to enforce dynamic consistency

**Auto-Generated Characters:**
- When the AI introduces a new named character during generation, Bible Auto-Population detects it, creates a minimal profile, and adds it to the bible with an `autoGenerated` flag
- Authors can later enrich auto-generated characters with full detail

---

## Style Learning & Fingerprinting

Teach the AI your writing voice by uploading samples of your own prose.

**Sample Upload:**
- Paste text samples (minimum 500 characters, up to 50,000 characters)
- Multiple samples aggregate into a richer fingerprint

**Style Fingerprint - Numeric Metrics:**
- Vocabulary complexity (0-1 scale)
- Average sentence length (words)
- Dialogue ratio (proportion of text in dialogue)
- Show vs. tell ratio
- Passive voice ratio
- Adverb density
- Metaphor frequency
- Pacing score

**Style Fingerprint - Rich Voice Capture:**
- Signature phrases: characteristic expressions you use
- Dialogue tags: preferred and avoided
- Verb choices: categorized by movement, speech, and emotion
- Sentence patterns: rhythm DNA showing how you vary length
- Paragraph openers: how you begin paragraphs
- Scene openings: how you open scenes
- Tension techniques: how you build suspense
- Exemplars: your best passages for the AI to emulate
- Humor style, emotional palette, prose techniques, pacing description
- Avoidances: patterns you dislike (populated from feedback)

**Feedback Loop:**
- After generation, provide feedback on what you liked or disliked
- Feedback is stored in lifetime memory and shapes future avoidances and preferences
- The AI learns your preferences over time through accumulated feedback history

**Reset:**
- Clear your entire fingerprint and start fresh

---

## Five-Pass Continuity Checking

Every piece of generated text passes through five parallel AI verification passes before being presented to the author.

**Pass 1 - Scene Roster (weight: 0.20):**
- Validates character names against the bible (including nicknames)
- Detects unknown characters introduced without bible entries
- Checks character-location plausibility
- Violation types: `unknown_character`, `name_mismatch`, `wrong_location`

**Pass 2 - Voice Consistency (weight: 0.25):**
- Validates internal monologue against the POV character's cognitive filter
- Checks for forbidden word usage
- Detects voice drift into another character's patterns
- Validates POV and tense against style directives
- Violation types: `forbidden_word`, `voice_drift`, `pov_break`, `tense_shift`

**Pass 3 - Fact Continuity (weight: 0.25):**
- Cross-references character descriptions, backstories, and world facts
- Detects premature knowledge (character knows something they shouldn't)
- Checks world rule violations
- Respects spoiler exclusions for unrevealed plot points
- Violation types: `contradiction`, `premature_knowledge`, `rule_violation`, `description_mismatch`

**Pass 4 - Timeline/Spatial (weight: 0.15):**
- Validates logical time progression within scenes
- Detects character teleportation between locations without transitions
- Checks scene transition smoothness
- Violation types: `time_paradox`, `teleportation`, `missing_transition`, `time_inconsistency`

**Pass 5 - Relationship State (weight: 0.15):**
- Validates character interactions against the relationship map
- Detects role violations and unjustified power dynamic shifts
- Violation types: `relationship_break`, `role_violation`, `dynamic_shift`

**Fixability Classification:**
Each violation is classified by how it should be fixed:
- `text`: the AI rewriter can fix it automatically
- `bible`: triggers auto-population of the Story Bible
- `author`: requires a creative decision from the human author (surfaced in the UI)

---

## Bible Auto-Population

When generated text introduces entities not present in the Story Bible, the system automatically extracts and adds them.

- Detects new named characters from scene roster violations
- Detects new locations from spatial violations
- Filters out generic references ("a girl", "the teacher") and architectural features ("door", "hallway")
- Creates minimal character profiles with `autoGenerated: true` flag
- Creates minimal location entries with `autoGenerated: true` flag
- Immediately merges into the live bible and persists to storage

---

## Four-Layer Memory Architecture

**Layer 1 - Project Context:**
- Story Bible (premise, characters, world, plot)
- Chapter content and structure
- All per-project data

**Layer 2 - Craft Memory:**
- Universal writing patterns stored as craft patterns
- Each pattern has a category, description, example, and effectiveness score
- Used across all projects to improve generation quality

**Layer 3 - Lifetime Memory:**
- Insights: accumulated observations about the user's preferences (typed, scored by strength)
- Writing history: daily word count tracking per project
- Feedback history: every piece of feedback given on generated text, stored with the generated text and the reason

**Layer 4 - User Preferences:**
- Style fingerprint (see Style Learning section)
- Generation settings: default temperature, default target words
- UI preferences: theme, font size, word count display

All four layers are loaded into the generation context when the AI produces new content, ensuring continuity across sessions and projects.

---

## Triple Redundant Save System

The save system is designed for zero data loss through three independent persistence layers.

**Layer 1 - Transaction Log:**
- Append-only JSONL file written with `fsync` before any other operation
- Rotated daily (`txlog-YYYY-MM-DD.jsonl`)
- Each entry contains: timestamp, operation (save/restore/delete), chapter ID, full content, word count, trigger type, sequence number
- Survives database corruption, process crashes, and power loss
- Replayable for full recovery

**Layer 2 - SQLite with WAL Mode:**
- `journal_mode = WAL` (Write-Ahead Logging) for crash-safe writes
- `synchronous = FULL` ensures every commit is fsynced to disk
- Foreign key integrity enforced
- Prepared statements for performance

**Layer 3 - Version History:**
- Every save creates a new version record in the `chapter_versions` table
- Versions are never deleted (prunable with configurable retention)
- Full chapter content stored in each version
- Trigger type recorded (sentence_end, paragraph, idle, manual, generation, autonomous, paste)
- Browsable version history with restore capability

**File-Level Atomicity:**
- JSON data files use write-to-temp-then-rename pattern
- Backup files maintained for recovery on write failure
- Automatic restoration from backup if the main file is missing after a failed write

---

## Multi-Provider AI (BYOK)

Bring Your Own Key architecture supports multiple AI providers with zero vendor lock-in.

**Supported Providers:**

| Provider | SDK/Method | Models |
|----------|-----------|--------|
| Groq | Groq SDK | moonshotai/kimi-k2, llama, mixtral, and all Groq-hosted models |
| OpenAI | OpenAI SDK | GPT-4o, GPT-4, GPT-3.5, and all OpenAI models |
| Anthropic Claude | Direct REST API | Claude Sonnet, Opus, Haiku |
| Google Gemini | Direct REST API | Gemini 3 Pro, Gemini 3 Flash, Gemini 2.5 Flash |
| Ollama (Local) | OpenAI-compatible SDK | Any locally running model |
| OpenAI-Compatible | OpenAI SDK | Any service with an OpenAI-compatible API (LMStudio, etc.) |

**Configuration Priority:**
1. Saved UI config (user's explicit choice persists across restarts)
2. Explicit `AI_PROVIDER` + `AI_MODEL` environment variables
3. Auto-detection from model name (e.g., `gemini-` prefix routes to Google)
4. Any available API key in the environment

**Provider Management UI:**
- Switch providers from the Settings tab
- Enter API keys per provider
- Dynamic model list fetching for Groq, Google, and Ollama
- Custom model name input for OpenAI-compatible providers
- Connection test button to verify API key and endpoint before saving

**Token Limits per Stage:**
| Stage | Max Input | Max Output |
|-------|-----------|------------|
| Style Analysis | 60,000 | 16,000 |
| Main Generation | 100,000 | 16,000 |
| Quality Scoring | 30,000 | 4,000 |
| Continuity Check | 30,000 | 8,000 |
| Retry Generation | 75,000 | 16,000 |
| Autonomous Iterate | 75,000 | 16,000 |
| Narrative State | 10,000 | 2,000 |
| Polish Text | 30,000 | 16,000 |
| Beat Verification | 10,000 | 10,000 |
| Story Bible Extract | 800,000 | 16,000 |

---

## Document Export

Export your work in five formats, supporting both single-chapter and full-book export.

| Format | Extension | Details |
|--------|-----------|---------|
| Word | `.docx` | Multi-section document with chapter headings, bold/italic preservation |
| PDF | `.pdf` | Browser print dialog with professional manuscript formatting (Times New Roman, 12pt, 1-inch margins, indented paragraphs) |
| Plain Text | `.txt` | Chapter titles uppercased, HTML stripped, separated by horizontal rules |
| Markdown | `.md` | Proper heading hierarchy, bold/italic converted, scene breaks preserved |
| HTML | `.html` | Standalone styled HTML file with Georgia/serif typography |

All exports support multi-chapter books with proper chapter separators and page breaks.

---

## Metrics Dashboard

Real-time monitoring of system performance and writing progress.

**System Health:**
- Status indicator: healthy, degraded, or unhealthy
- Thresholds: unhealthy at >10 errors or >10s avg latency; degraded at >5 errors or >5s avg latency
- Success rate percentage
- Average latency in milliseconds
- Server uptime display

**Token Usage:**
- Total tokens consumed (all time)
- Today's token usage
- Per-endpoint token breakdown
- Last 7 days daily usage

**Quality Scores:**
- Average quality score across all generations
- Trend indicator: improving, stable, or declining (calculated over last 20 scores)
- Recent score history (last 100 scores)

**Extraction Metrics:**
- Total Story Bible extraction iterations
- Recent extractions with: passes run, characters found, new additions, duplicates skipped, enrichments performed

**Request Tracking:**
- Total requests served
- Per-endpoint request counts

**Log Viewer:**
- Filterable server log stream (last 50 entries)
- Color-coded by level (debug, info, warn, error)
- Each entry shows timestamp, context, and message

---

## Nonfiction Mode

A separate writing mode optimized for educational and informational content.

- Triggered by including `[NONFICTION]` in the generation prompt
- Uses a distinct system prompt optimized for clarity, structure, and authority
- Applies nonfiction formatting rules: headers, bullet points, numbered lists, bold key terms
- Supports bidirectional context window for seamless insertion
- Does not apply fiction-specific Story Bible context

---

## Bidirectional Context Window

The generation system captures text both before and after the cursor position.

- Up to 10,000 characters of context in each direction (configurable in preferences)
- Text before the cursor: the AI continues from this point
- Text after the cursor: the AI writes toward this content for smooth bridging
- Enables mid-document insertions that blend seamlessly with surrounding prose
- Used in both manual generation and autonomous writing

---

## Quality Scoring & Auto-Regeneration

Generated content is evaluated for quality before presentation.

- AI-powered quality scoring on a 0-10 scale
- Configurable minimum quality threshold (default: 7)
- Scores tracked in metrics with trend analysis
- Retry endpoint (`/api/generate/retry`) for regenerating unsatisfactory content
- Quality scores cached to avoid redundant API calls for unchanged content

---

## Caching Layer

Multiple caches reduce redundant computation and API calls.

| Cache | Key | TTL | Purpose |
|-------|-----|-----|---------|
| Story Bible Serialization | Project ID | Content-hash based | Avoid re-serializing unchanged bibles |
| Narrative State | Chapter ID | Content-hash based | Persist time/location/mood across iterations |
| Quality Scores | Content hash | 1 hour | Skip re-scoring unchanged content |
| Continuity Index | Project ID | Content-hash based | Pre-built character/thread lookup |
| Style Analysis | Sample hash | 24 hours | Avoid re-analyzing unchanged samples |

Cache stats are exposed via `/api/cache/stats` and can be cleared selectively via `/api/cache/clear`.

---

## Structured Logging

All server operations produce structured log entries.

- JSON-formatted entries with: timestamp, level (debug/info/warn/error), context, message, optional data
- In-memory buffer (last 500 entries) for the Metrics Dashboard log viewer
- Daily rotating log files in `.novawrite-data/logs/`
- Color-coded console output for development
- Context-scoped loggers per subsystem (server, scene_roster, voice_consistency, etc.)

---

## Session Management

Autonomous writing sessions are fully managed server-side.

- Sessions have unique IDs, project/chapter associations, and lifecycle status (running, paused, completed, stopped)
- 24-hour TTL with automatic cleanup every hour
- Session state includes: target words, generated words, iteration count, plot points to hit, plot points achieved, narrative state
- Book mode sessions track: chapters to write, current chapter index, chapters completed, total book words
- Abort support: all API calls are wrapped with AbortSignal for clean cancellation

---

## Draft Persistence

Generated-but-not-yet-accepted content is saved independently.

- Drafts stored as HTML files in `.novawrite-data/drafts/`
- Named by project ID, chapter ID, and session ID for easy identification
- Survives server restarts: if you reload before accepting, the draft is recoverable
- Automatically deleted when the draft is accepted into the chapter

---

## Database Health Monitoring

The `/api/db/health` endpoint reports on database configuration safety.

- Verifies WAL mode is active
- Verifies synchronous mode is set to FULL
- Returns `ok: true` only when both conditions are met
- Used for deployment verification and monitoring


User guide-

# Magnum Opus - User Guide

## Table of Contents

- [Getting Started](#getting-started)
- [Setting Up Your AI Provider](#setting-up-your-ai-provider)
- [Creating Your First Project](#creating-your-first-project)
- [Building Your Story Bible](#building-your-story-bible)
- [Creating Characters](#creating-characters)
- [Writing in the Editor](#writing-in-the-editor)
- [AI-Assisted Generation](#ai-assisted-generation)
- [Autonomous Writing](#autonomous-writing)
- [Writing a Full Book](#writing-a-full-book)
- [Teaching Your Writing Style](#teaching-your-writing-style)
- [Reviewing and Accepting Drafts](#reviewing-and-accepting-drafts)
- [Managing Chapters](#managing-chapters)
- [Exporting Your Work](#exporting-your-work)
- [Using Nonfiction Mode](#using-nonfiction-mode)
- [Monitoring Performance](#monitoring-performance)
- [Managing Memory and Preferences](#managing-memory-and-preferences)
- [Version History and Recovery](#version-history-and-recovery)
- [Troubleshooting](#troubleshooting)

---

## Getting Started

### Prerequisites

- Node.js 20 or higher
- An API key from at least one supported AI provider (Groq, OpenAI, Anthropic, Google, or a local Ollama installation)

### Installation

```bash
# Clone the repository
git clone <your-repo-url> magnum-opus
cd magnum-opus

# Install dependencies
npm install

# Copy the environment template
cp .env.example .env
```

Edit `.env` and add your API key(s). At minimum, set one:

```bash
GROQ_API_KEY=your_key_here
# or
OPENAI_API_KEY=your_key_here
# or
GOOGLE_API_KEY=your_key_here
# or
ANTHROPIC_API_KEY=your_key_here
```

### Starting the Application

```bash
# Development mode (both frontend and backend with hot reload)
npm run dev

# Frontend: http://localhost:5173
# Backend API: http://localhost:3001
```

### Production Build

```bash
npm run build
npm start
```

---

## Setting Up Your AI Provider

1. Open Magnum Opus and navigate to **Settings**
2. Under **AI Provider**, select your provider from the dropdown
3. Enter your API key
4. For providers with dynamic model lists (Groq, Google, Ollama), click **Fetch Models** to load available options
5. Select your preferred model
6. Click **Test Connection** to verify everything works
7. Click **Save Provider Config**

Your provider choice persists across server restarts.

### Recommended Providers for Fiction

- **Groq** with `moonshotai/kimi-k2-instruct-0905`: fast inference, strong creative writing
- **Anthropic Claude** with `claude-sonnet-4-20250514`: excellent character development
- **Google Gemini** with `gemini-3-pro`: large context window, good for long novels

### Using Ollama (Local Models)

1. Install Ollama from https://ollama.ai
2. Pull a model: `ollama pull llama3.2`
3. In Magnum Opus Settings, select **Ollama** as the provider
4. The base URL defaults to `http://localhost:11434/v1`
5. Select your model from the fetched list

---

## Creating Your First Project

1. From the project list, click **New Project**
2. Enter a project title
3. You will be taken to the editor view with an empty first chapter
4. Before writing, set up your Story Bible for best results

---

## Building Your Story Bible

The Story Bible is the foundation of consistent AI generation. Navigate to the **Story Bible** tab.

### Premise

Fill in:
- **Logline**: your one-sentence elevator pitch
- **Synopsis**: a paragraph-level summary
- **Themes**: add individual themes (e.g., "redemption", "coming of age")
- **Tone**: describe the overall feel (e.g., "dark and atmospheric with moments of dark humor")
- **Genre**: select or type your genre

### World Building

- **Setting**: describe the world (e.g., "a dystopian megacity in 2147")
- **Time Period**: when the story takes place
- **Locations**: add named locations with descriptions and narrative significance. The AI will reference these during generation and continuity checking.
- **World Rules**: add rules the AI must respect (e.g., "magic requires blood sacrifice", "faster-than-light travel is impossible")

### Plot Structure

- **Acts**: define your act structure (typically 3-5 acts). Each act has a name, description, and key events.
- **Plot Threads**: add storylines the AI should track. For each thread, specify type (main plot, subplot, character arc, mystery, romance), status, tension level, and key beats.
- **Chapter Outlines**: define per-chapter structure with beats, characters, locations, and timeframes. These outlines drive autonomous chapter generation.

### Style Directives

- **POV**: e.g., "third person limited (rotating)", "first person"
- **Tense**: "past" or "present"
- **Prose Style**: describe your target prose (e.g., "literary fiction with short, punchy sentences")
- **Dialogue Style**: describe how dialogue should read (e.g., "naturalistic with interruptions and trailing off")

### Auto-Extraction from Existing Manuscripts

If you already have written chapters:
1. Click **Extract from Content**
2. The AI analyzes your existing text in multiple passes
3. Characters, locations, plot threads, and themes are extracted and populated automatically
4. Review the extracted data and enrich or correct as needed

---

## Creating Characters

From the Story Bible tab, navigate to the Characters section.

### Basic Profile

- **Name** and **Nicknames**: the AI recognizes both during continuity checking
- **Role**: protagonist, antagonist, supporting, or minor
- **Description**: physical appearance and key traits
- **Backstory**: history (mark as **Unrevealed** if the reader shouldn't know yet)
- **Motivation**, **Fears**, **Flaw**, **Character Arc**

### Voice Profile

- **Vocabulary**: describe how they speak (e.g., "uses academic language, avoids slang")
- **Speech Patterns**: list distinctive patterns (e.g., "speaks in short sentences", "uses military jargon")
- **Catchphrases**: recurring phrases

### Cognitive Filter (Advanced)

For POV characters, define how they perceive the world:

- **Primary Mode**: analytical, emotional, instinctive, ritualistic, detached, or sensory
- **Internal Language**: how their thoughts are expressed (e.g., "fragmented sensation, no complete sentences")
- **Blind Spot**: what they consistently fail to notice
- **Repeating Thought Loop**: a recurring internal phrase
- **Forbidden Words**: terms this character would never use in thought
- **Signature Thoughts**: distinctive internal phrases

The cognitive filter shapes all internal monologue when this character is the POV character.

### Relationships

Add relationships to other characters with type and description. The continuity checker uses these to validate character interactions.

---

## Writing in the Editor

### Manual Writing

Click into the editor and type. Your work is automatically saved through the triple redundancy system:

- **Sentence save**: triggers when you end a sentence (`.` `!` `?`)
- **Paragraph save**: triggers on paragraph breaks
- **Idle save**: triggers after 2 seconds of inactivity
- **Paste save**: triggers when you paste content

The save indicator in the toolbar shows current status.

### Chapter Navigation

- The chapter sidebar (left panel) shows all chapters
- Click a chapter to switch to it
- Click **+** to add a new chapter
- Drag to reorder chapters (by sort order)
- Delete chapters from the sidebar context menu

---

## AI-Assisted Generation

### Generating Content

1. In the editor, position your cursor where you want new content
2. In the AI generation panel (right side), type a prompt describing what you want (optional - leave blank for a natural continuation)
3. Set the target word count using the slider (100-5,000 words)
4. Click **Generate**

The AI receives:
- Your Story Bible context
- Your style fingerprint
- 10,000 characters of text before the cursor
- 10,000 characters of text after the cursor
- Your prompt

### Reviewing Generated Content

Generated text appears as a **pending draft**:
- Review the content in the preview area
- Click **Accept** to merge it into your chapter
- Click **Reject** to discard it
- Enable **Auto-Accept** to skip the review step

### Regenerating

If the generated content isn't satisfactory, use the retry feature to get a new generation with the same context.

---

## Autonomous Writing

### Writing a Single Chapter

1. Navigate to the **Autonomous Writer** tab
2. Select the target chapter from the dropdown
3. Set the target word count (up to 5,000 words)
4. Select the act number for structural context
5. Check the plot points and plot threads you want the chapter to address
6. Click **Write Full Chapter**

The AI will:
- Generate ~500 words per iteration
- Run five continuity checks after each iteration
- Auto-populate the Story Bible with any new characters or locations
- Track which plot points have been hit
- Maintain narrative state (time, location, POV character, mood) across iterations

### Monitoring Progress

While the autonomous writer is running:
- Word count and iteration count update in real time
- Plot points show as "hit" when the AI addresses them
- The activity log shows what's happening at each step
- Narrative state shows the current scene context

### Controls

- **Pause**: halts generation after the current iteration completes
- **Resume**: continues from where it paused
- **Stop**: ends the session entirely

---

## Writing a Full Book

### Book Mode

1. In the Autonomous Writer, switch to **Book** mode
2. Select which chapters to write (multi-select)
3. Set the word count per chapter
4. Click **Write Book**

The engine processes each chapter sequentially:
- Current chapter progress and overall book progress are displayed
- Chapter outlines from the Story Bible automatically provide beats and characters for each chapter
- When one chapter reaches its target, the engine advances to the next

### Preparing Chapters for Book Mode

Use the **Prepare Book Mode** feature to auto-create chapters from your Story Bible chapter outlines if they don't already exist.

---

## Teaching Your Writing Style

### Uploading Samples

1. Navigate to the **Style Learning** tab
2. Paste a sample of your writing into the text area (minimum 500 characters, up to 50,000)
3. Click **Analyze Sample**
4. The AI analyzes your vocabulary, sentence structure, dialogue patterns, and more
5. Your style fingerprint updates with each new sample

### What Gets Analyzed

- Sentence length variation and rhythm
- Dialogue-to-narration ratio
- Show vs. tell tendency
- Passive voice usage
- Adverb density
- Metaphor frequency
- Signature phrases and verb choices
- Scene and paragraph opening patterns
- Tension techniques

### Providing Feedback

After receiving generated content:
- Rate whether the style matched your voice
- Describe what felt wrong or right
- Feedback accumulates in your lifetime memory and refines future generations

### Resetting Your Fingerprint

If your style changes significantly, use the **Reset Fingerprint** button to start fresh with new samples.

---

## Reviewing and Accepting Drafts

All AI-generated content (both manual and autonomous) goes through a draft review workflow:

1. Content appears in the **Pending Draft** area
2. Read the draft carefully
3. **Accept**: the content is merged into your chapter at the cursor position (or appended in autonomous mode)
4. **Reject**: the content is discarded
5. **Auto-Accept**: toggle this to skip review for faster autonomous writing

Accepted drafts are saved through the triple redundancy system. Rejected drafts are deleted from disk.

---

## Managing Chapters

### Adding Chapters

- Click the **+** button in the chapter sidebar
- New chapters are added at the end of the chapter list

### Reordering Chapters

- Chapters have a sort order that determines their display position
- Edit the sort order in the chapter properties

### Deleting Chapters

- Click the delete button next to a chapter in the sidebar
- Confirm the deletion
- Chapter versions are also deleted (cascade)

### Chapter Cleanup

Use the cleanup endpoint to remove empty or duplicate chapters from a project.

---

## Exporting Your Work

### Single Chapter Export

1. In the editor, click the **Export** button
2. Select a format: Word (.docx), PDF, Plain Text (.txt), Markdown (.md), or HTML
3. The file downloads immediately

### Full Book Export

1. The export includes all chapters in order
2. Word exports create multi-section documents with chapter headings
3. PDF exports add page breaks between chapters

### Format Details

- **Word (.docx)**: preserves bold/italic formatting, proper headings, chapter structure
- **PDF**: opens browser print dialog with manuscript formatting (Times New Roman, 12pt, 1-inch margins, 0.5-inch paragraph indents)
- **Plain Text (.txt)**: clean text with uppercase chapter titles
- **Markdown (.md)**: proper heading hierarchy with scene breaks preserved
- **HTML (.html)**: standalone styled page with serif typography

---

## Using Nonfiction Mode

To generate nonfiction content, prefix your prompt with `[NONFICTION]`:

```
[NONFICTION] Write a section about the history of quantum computing
```

Nonfiction mode uses:
- Clear, authoritative prose style
- Headers and subheaders for organization
- Bullet points for lists
- Bold for key terms
- Topic sentences and evidence-based paragraphs
- No Story Bible context (since it's not fiction)

---

## Monitoring Performance

Navigate to the **Metrics** tab to view:

- **System Health**: overall status, success rate, average latency, uptime
- **Token Usage**: total tokens, today's tokens, per-endpoint breakdown, 7-day history
- **Quality Scores**: average score, trend (improving/stable/declining), recent history
- **Extraction Stats**: Story Bible extraction iterations with detail
- **Request Counts**: total and per-endpoint
- **Server Logs**: filterable log viewer showing recent entries

The dashboard auto-refreshes every 30 seconds.

---

## Managing Memory and Preferences

### Preferences

In Settings, configure:
- **Temperature**: creativity level (0.0 = deterministic, 1.0 = highly creative). Default: 0.8
- **Max Tokens Per Generation**: upper limit for single generations. Default: 2,000
- **Auto-Save Interval**: how often idle saves trigger. Default: 30 seconds
- **Min Quality Threshold**: minimum acceptable quality score. Default: 7
- **Continuity Checks**: enable/disable the five-pass continuity system
- **Preferred POV and Tense**: defaults for new projects
- **Context Window Size**: how much surrounding text to include. Default: 10,000 characters

### Craft Patterns

View, add, and manage universal writing patterns that apply across all projects. Each pattern has a category, description, example, and effectiveness score.

### Lifetime Memory

View your accumulated insights and feedback history. Reset lifetime memory if you want a fresh start.

### Memory Stats

The memory stats endpoint shows sizes and counts for all data stores.

---

## Version History and Recovery

### Viewing History

Every change to every chapter is versioned. Access version history through the editor's chapter options.

### Restoring a Version

1. Browse the version history for the target chapter
2. Select the version you want to restore
3. Click **Restore** - this creates a new version (it doesn't delete history)

### Crash Recovery

If the server crashes during an autonomous writing session:
- The transaction log contains every save operation
- Session snapshots in SQLite capture autonomous session state
- Draft files on disk preserve generated content that wasn't yet accepted
- On restart, resume from the last known good state

---

## Troubleshooting

### "No API key configured"

Set at least one API key in your `.env` file or configure it through the Settings UI.

### "No model configured"

Set `AI_MODEL` in your `.env` file or select a model in Settings.

### Generation produces empty results

- Check the Metrics dashboard for error logs
- Verify your API key is valid using the Test Connection button
- Check that your provider account has sufficient credits/quota

### Content looks inconsistent with my Story Bible

- Ensure your Story Bible is fully populated (characters, world, plot structure)
- Check that style directives are set
- Verify continuity checks are enabled in preferences

### Auto-save shows "unsaved" and doesn't recover

- Check the server logs for database errors
- Verify the `.novawrite-data` directory exists and is writable
- Check database health at `/api/db/health`

### Server won't start

- Ensure Node.js 20+ is installed: `node --version`
- Run `npm install` to ensure all dependencies are present
- Check for port conflicts on 3001 (backend) and 5173 (frontend)
