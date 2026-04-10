import {
  buildFourLayerMemorySummary,
  deriveLifetimeInsights,
  hydrateLifetimeMemory,
  recordProjectMemoryFromChapterSave,
  recordProjectPreference,
  selectRelevantProjectMemory,
} from "@server/src/services/memory/fourLayerMemory";
import {
  makeLifetimeMemory,
  makeProject,
  makeStyleFingerprint,
  makeStoryBible,
  makeUserPreferences,
} from "@tests/services/helpers";

const LONG_CHAPTER_TEXT = Array.from(
  { length: 22 },
  () =>
    "Mara crosses the freezing archive floor, logs each alarm pulse, and forces herself to keep moving toward the vault.",
).join(" ");

describe("fourLayerMemory service", () => {
  it("hydrates missing lifetime memory collections", () => {
    expect(hydrateLifetimeMemory(null)).toEqual({
      insights: [],
      writingHistory: [],
      feedbackHistory: [],
      projectMemories: [],
    });
  });

  it("derives insights from feedback patterns and project preferences", () => {
    const memory = makeLifetimeMemory({
      feedbackHistory: [
        {
          generatedText: "",
          feedback: "This gets purple and wordy in the action beats.",
          reason: "purple prose",
          timestamp: "2025-01-01T00:00:00.000Z",
        },
      ],
      projectMemories: [
        {
          projectId: "project-1",
          updatedAt: "2025-01-01T00:00:00.000Z",
          events: [],
          preferences: [
            {
              id: "pref-1",
              content: "Keep Mara's internal monologue clipped and tactical.",
              strength: 0.9,
              source: "editor",
              updatedAt: "2025-01-01T00:00:00.000Z",
            },
          ],
        },
      ],
    });

    const contents = deriveLifetimeInsights(memory).map(
      (insight) => insight.content,
    );
    expect(contents).toContain("Keep prose grounded; avoid purple flourishes.");
    expect(contents).toContain(
      "Keep Mara's internal monologue clipped and tactical.",
    );
  });

  it("records project memory using chapter outline context", () => {
    const memory = makeLifetimeMemory();
    const project = makeProject({
      chapters: [
        {
          id: "chapter-7",
          title: "Chapter 7",
          content: LONG_CHAPTER_TEXT,
          wordCount: 220,
          order: 6,
        },
      ],
      storyBible: makeStoryBible({
        world: {
          setting: "The Archive",
          timePeriod: "",
          locations: [],
          rules: [],
        },
        chapterOutlines: [
          {
            chapterNumber: 7,
            title: "Chapter 7",
            summary:
              "Mara breaks into the archive vault and realizes the alarm pattern is being mirrored by someone inside.",
            beats: [],
            characters: ["Mara", "Jonah"],
            location: "Archive Vault",
            timeframe: "Night",
          },
        ],
      }),
    });

    recordProjectMemoryFromChapterSave({
      memory,
      project,
      chapterId: "chapter-7",
      content: LONG_CHAPTER_TEXT,
      trigger: "accepted_generation",
    });

    const event = memory.projectMemories[0]?.events[0];
    expect(event).toMatchObject({
      chapterId: "chapter-7",
      chapterTitle: "Chapter 7",
      location: "Archive Vault",
      characters: ["Mara", "Jonah"],
      source: "accepted_generation",
    });
    expect(event?.summary).toContain("Latest accepted movement:");
  });

  it("merges duplicate project preferences and selects relevant memory", () => {
    const memory = makeLifetimeMemory();
    const project = makeProject();

    recordProjectPreference({
      memory,
      projectId: project.id,
      content: "Keep the vault scenes procedural and concrete.",
      source: "editor",
      strength: 0.5,
    });
    recordProjectPreference({
      memory,
      projectId: project.id,
      content: "Keep the vault scenes procedural and concrete.",
      source: "editor",
      strength: 0.5,
    });

    memory.projectMemories[0]?.events.push({
      id: "evt-1",
      chapterId: "chapter-3",
      chapterTitle: "Chapter 3",
      summary: "Mara maps the vault and spots the mirrored alarm rhythm.",
      characters: ["Mara"],
      location: "Vault",
      source: "accepted_generation",
      timestamp: "2025-01-01T00:00:00.000Z",
      weight: 0.9,
    });

    const relevant = selectRelevantProjectMemory({
      memory,
      project,
      focusText: "Mara studies the vault alarm pattern.",
      persistentDirections: "- Stay in Mara's POV\n- Keep scenes tactile",
    });

    expect(memory.projectMemories[0]?.preferences).toHaveLength(1);
    expect(memory.projectMemories[0]?.preferences[0]?.strength).toBeGreaterThan(
      0.5,
    );
    expect(relevant.authorDirections).toEqual([
      "Stay in Mara's POV",
      "Keep scenes tactile",
    ]);
    expect(relevant.projectPreferences[0]).toContain("vault scenes procedural");
    expect(relevant.projectEvents[0]).toContain("vault");
  });

  it("builds a summary of the four memory layers", () => {
    const summary = buildFourLayerMemorySummary({
      craftPatterns: [
        {
          id: "craft-1",
          category: "pacing",
          pattern: "Escalate danger every scene.",
          example: "",
          effectiveness: 0.9,
        },
      ],
      lifetimeMemory: makeLifetimeMemory({
        insights: [
          {
            id: "insight-1",
            type: "habit",
            content:
              "Recent substantive generations commonly land around 900 words.",
            strength: 0.5,
            createdAt: "2025-01-01T00:00:00.000Z",
          },
        ],
        projectMemories: [
          {
            projectId: "project-1",
            updatedAt: "2025-01-01T00:00:00.000Z",
            events: [
              {
                id: "evt-1",
                summary: "Mara enters the vault.",
                characters: ["Mara"],
                location: "Vault",
                source: "accepted_generation",
                timestamp: "2025-01-01T00:00:00.000Z",
                weight: 0.9,
              },
            ],
            preferences: [],
          },
        ],
      }),
      scenePromptPlans: [
        {
          id: "plan-1",
          projectId: "project-1",
          createdAt: "2025-01-01T00:00:00.000Z",
          sceneGoal: "Break into the vault",
          objectives: [],
          selectedEvidence: [],
          directive: "Keep it tight",
          plannerModelUsed: "gpt-5",
          embeddingModelUsed: "text-embedding-3-large",
        },
      ],
      styleFingerprint: makeStyleFingerprint({ sampleCount: 6 }),
      userPreferences: makeUserPreferences({
        memorySettings: {
          persistentDirections: "- Stay tactile\n- Avoid summary",
        },
      }),
    });

    expect(summary.craft.topPatterns).toEqual(["Escalate danger every scene."]);
    expect(summary.lifetime.topInsights).toEqual([
      "Recent substantive generations commonly land around 900 words.",
    ]);
    expect(summary.preference.persistentDirectionsCount).toBe(2);
    expect(summary.context.projectEventCount).toBe(1);
    expect(summary.context.styleSampleCount).toBe(6);
  });
});
