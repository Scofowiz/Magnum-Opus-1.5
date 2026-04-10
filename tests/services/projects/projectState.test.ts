import {
  countPlainWords,
  createChapter,
  createDefaultStoryBible,
  rebuildProjectTotals,
} from "@server/src/services/projects/projectState";
import { makeProject } from "@tests/services/helpers";

describe("projectState service", () => {
  it("counts plain words after stripping html", () => {
    expect(countPlainWords("<p>Mara <strong>runs</strong> now</p>")).toBe(3);
  });

  it("rebuilds project totals with an injected clock", () => {
    const project = makeProject({
      chapters: [
        {
          id: "a",
          title: "One",
          content: "alpha beta",
          wordCount: 2,
          order: 0,
        },
        {
          id: "b",
          title: "Two",
          content: "gamma delta epsilon",
          wordCount: 3,
          order: 1,
        },
      ],
    });

    rebuildProjectTotals(project, {
      now: () => "2025-02-02T02:02:02.000Z",
    });

    expect(project.content).toBe("alpha beta\n\ngamma delta epsilon");
    expect(project.wordCount).toBe(5);
    expect(project.updatedAt).toBe("2025-02-02T02:02:02.000Z");
  });

  it("creates the default story bible shape", () => {
    expect(createDefaultStoryBible()).toEqual({
      premise: {
        logline: "",
        synopsis: "",
        themes: [],
        tone: "",
        genre: "",
      },
      characters: [],
      world: { setting: "", timePeriod: "", locations: [], rules: [] },
      plotStructure: { acts: [], plotThreads: [] },
      styleDirectives: {
        pov: "third-limited",
        tense: "past",
        proseStyle: "",
        dialogueStyle: "",
      },
      chapterOutlines: [],
    });
  });

  it("creates chapters with an injected id generator", () => {
    expect(
      createChapter("Chapter 9", 8, {
        createId: () => "chapter-9",
      }),
    ).toEqual({
      id: "chapter-9",
      title: "Chapter 9",
      content: "",
      wordCount: 0,
      order: 8,
    });
  });
});
