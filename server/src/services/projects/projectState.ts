import type { Chapter, Project, StoryBible } from "../../domain/types.js";

interface ProjectStateDeps {
  now?: () => string;
  createId?: () => string;
}

function defaultNow(): string {
  return new Date().toISOString();
}

function defaultCreateId(): string {
  return crypto.randomUUID();
}

export function countPlainWords(content: string): number {
  return content
    .replace(/<[^>]*>/g, " ")
    .split(/\s+/)
    .filter(Boolean).length;
}

export function rebuildProjectTotals(
  project: Project,
  deps: Pick<ProjectStateDeps, "now"> = {},
): Project {
  project.content = project.chapters
    .map((chapter) => chapter.content)
    .join("\n\n");
  project.wordCount = project.chapters.reduce(
    (sum, chapter) => sum + chapter.wordCount,
    0,
  );
  project.updatedAt = (deps.now || defaultNow)();
  return project;
}

export function createDefaultStoryBible(): StoryBible {
  return {
    premise: { logline: "", synopsis: "", themes: [], tone: "", genre: "" },
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
  };
}

export function createChapter(
  title: string,
  order: number,
  deps: Pick<ProjectStateDeps, "createId"> = {},
): Chapter {
  return {
    id: (deps.createId || defaultCreateId)(),
    title,
    content: "",
    wordCount: 0,
    order,
  };
}
