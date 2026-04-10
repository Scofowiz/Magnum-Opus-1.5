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
