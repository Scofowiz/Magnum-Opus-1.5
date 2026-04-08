import type { Express, Request, Response } from "express";
import { convert as htmlToPlainText } from "html-to-text";
import type { ProviderConfig } from "../core/types.js";
import type {
  Chapter,
  ChapterOutline,
  Character,
  Project,
  StoryBible,
} from "../domain/types.js";
import { createDefaultStoryBible } from "../services/projects/projectState.js";
import {
  enrichCharacter,
  findExistingCharacter,
  normalizeCharacterName,
} from "../services/storyBible/characterMerge.js";

interface StoryBibleRouteDeps {
  chatCompletion(
    systemPrompt: string,
    userMessage: string,
    options?: {
      maxTokens?: number;
      model?: string;
      provider?: ProviderConfig;
      signal?: AbortSignal;
    },
  ): Promise<{ text: string; tokens: number }>;
  config: {
    MIN_EXTRACTION_CHARS: number;
  };
  getStoryBibleModel(): string | undefined;
  getStoryBibleProvider(model?: string): ProviderConfig | undefined;
  extractJSON(text: string): string;
  logger: {
    info(message: string, data?: unknown): void;
    warn(message: string, data?: unknown): void;
    error(message: string, data?: unknown): void;
  };
  projects: Map<string, Project>;
  createLogger(scope: string): {
    info(message: string, data?: unknown): void;
    warn(message: string, data?: unknown): void;
    error(message: string, data?: unknown): void;
  };
  persistProjects(): void;
  tokenLimits: {
    STORY_BIBLE_EXTRACT: { input: number; output: number };
  };
  trackExtraction(
    passesRun: number,
    charactersFound: number,
    newAdded: number,
    duplicatesSkipped: number,
    enriched: number,
  ): void;
  trackRequest(endpoint: string): void;
}

type OrderedChapter = Chapter & { chapterNumber: number };
type StoryAct = StoryBible["plotStructure"]["acts"][number];

type CharacterExtractionPass = {
  name: string;
  prompt: string;
};

type CharacterPassMetrics = {
  pass: number;
  name: string;
  found: number;
  newAdded: number;
  duplicatesSkipped: number;
  enriched: number;
};

type CharacterExtractionMetrics = {
  passBreakdown: CharacterPassMetrics[];
  totalCharactersFound: number;
  totalNewAdded: number;
  totalDuplicatesSkipped: number;
  totalEnriched: number;
};

const CHARACTER_EXTRACTION_PASSES: CharacterExtractionPass[] = [
  {
    name: "Main Characters",
    prompt:
      "Extract ONLY the main characters: protagonists, antagonists, and key supporting characters who drive the plot. Focus on characters who appear frequently and have significant roles.",
  },
  {
    name: "Family & Close Relations",
    prompt:
      "Extract family members and close relations: spouses, partners, husbands, wives, parents, children, siblings, close friends, mentors. Skip main protagonists/antagonists already found.",
  },
  {
    name: "Minor Characters",
    prompt:
      "Extract minor and mentioned characters: named characters who appear briefly, characters mentioned but not shown, background characters with names. Skip anyone who seems like a main character.",
  },
];

const CHAPTER_OUTLINE_BATCH_SIZE = 2;
const STORY_BIBLE_CORE_SAMPLE_CHARS = 24000;
const STORY_BIBLE_CHARACTER_SAMPLE_CHARS = 32000;
const STORY_BIBLE_CHAPTER_SAMPLE_CHARS = 16000;
const STORY_BIBLE_REQUEST_TIMEOUT_MS = 45000;
const STORY_BIBLE_REFERENCE_HEADINGS = new Set([
  "logline",
  "synopsis",
  "themes",
  "era and setting",
  "setting",
  "characters",
  "organizations",
  "settings",
  "technology and world details",
  "key relationships",
  "writing style notes",
  "on dialogue",
  "on environment",
  "on tone",
  "on violence",
  "on wealth",
  "background",
  "personality",
  "physical presence",
  "voice and speech",
  "capabilities",
  "evolution arc",
  "the twin dynamic",
  "astrological note",
  "atmosphere",
  "geography",
  "crown jewel",
  "internal tension",
  "the role of fashion",
  "power structures",
  "annika's relationship to this",
  "relationship with coco",
  "rivalry with elsa ai",
  "end of story bible",
  "name",
  "pronouns",
  "roles",
  "other names",
  "groups",
  "physical description",
  "dialogue style",
  "sum total",
  "the critical loss",
  "coco's energy diet",
  "optimization manifesto",
  "phrases",
  "the secret origin",
  "craziness",
  "horoscope",
]);

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean)
    : [];
}

function buildEmptyCharacterExtractionMetrics(): CharacterExtractionMetrics {
  return {
    passBreakdown: [],
    totalCharactersFound: 0,
    totalNewAdded: 0,
    totalDuplicatesSkipped: 0,
    totalEnriched: 0,
  };
}

function getOrderedProjectChapters(project: Project): OrderedChapter[] {
  return project.chapters
    .map((chapter, index) => ({ chapter, index }))
    .sort((left, right) => {
      const leftOrder = Number.isFinite(left.chapter.order)
        ? left.chapter.order
        : left.index;
      const rightOrder = Number.isFinite(right.chapter.order)
        ? right.chapter.order
        : right.index;
      return leftOrder - rightOrder || left.index - right.index;
    })
    .map(({ chapter }, index) => ({
      ...chapter,
      chapterNumber: index + 1,
    }));
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function normalizeHeadingLabel(line: string): string {
  return line
    .trim()
    .replace(/[’]/g, "'")
    .replace(/^\s*(?:[-=*#]{2,}\s*)+/, "")
    .replace(/^\s*[-=*#]+\s*/, "")
    .replace(/\s*(?:[-=*#]{2,}\s*)+$/, "")
    .replace(/:+$/, "")
    .replace(/[.]+$/, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function isStoryBibleReferenceHeading(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) {
    return false;
  }

  if (/^==\s*[^=].*[^=]\s*==$/.test(trimmed)) {
    return true;
  }

  const label = normalizeHeadingLabel(trimmed);
  if (!label) {
    return false;
  }

  if (label.includes("story bible")) {
    return true;
  }

  if (STORY_BIBLE_REFERENCE_HEADINGS.has(label)) {
    return true;
  }

  return (
    /^who (she|he|they) is$/.test(label) ||
    /^[a-z][a-z '&/-]+&[a-z '&/-]+$/.test(label)
  );
}

function isExplicitChapterHeading(line: string): boolean {
  return /^(chapter|prologue|epilogue)\b/i.test(line.trim());
}

function findReferenceAppendixStart(normalizedText: string): number {
  const explicitMarkerIndex = normalizedText.search(
    /(?:^|\n)\s*(?:a\s+)?story bible\b/i,
  );
  if (explicitMarkerIndex >= 0) {
    return explicitMarkerIndex;
  }

  const lines = normalizedText.split("\n");
  const lineOffsets: number[] = [];
  let offset = 0;
  for (const line of lines) {
    lineOffsets.push(offset);
    offset += line.length + 1;
  }

  for (let index = 0; index < lines.length; index += 1) {
    if (
      lineOffsets[index] < 300 ||
      !isStoryBibleReferenceHeading(lines[index])
    ) {
      continue;
    }

    let headingCount = 1;
    for (
      let lookahead = index + 1;
      lookahead < Math.min(lines.length, index + 12);
      lookahead += 1
    ) {
      if (isStoryBibleReferenceHeading(lines[lookahead])) {
        headingCount += 1;
      }
    }

    if (headingCount >= 3) {
      return lineOffsets[index];
    }
  }

  return -1;
}

function splitNarrativeAndReferenceText(text: string): {
  fullText: string;
  narrativeText: string;
  referenceText: string;
} {
  const fullText = normalizeExtractionText(text);
  if (!fullText) {
    return { fullText: "", narrativeText: "", referenceText: "" };
  }

  const appendixStart = findReferenceAppendixStart(fullText);
  if (appendixStart < 0) {
    return {
      fullText,
      narrativeText: fullText,
      referenceText: "",
    };
  }

  return {
    fullText,
    narrativeText: fullText.slice(0, appendixStart).trim(),
    referenceText: fullText.slice(appendixStart).trim(),
  };
}

function buildSyntheticOrderedChapter(
  title: string,
  content: string,
  chapterNumber: number,
): OrderedChapter {
  return {
    id: `synthetic-${chapterNumber}`,
    title,
    content,
    wordCount: countWords(content),
    order: chapterNumber - 1,
    chapterNumber,
  };
}

function buildInferredExtractionChapters(text: string): OrderedChapter[] {
  const normalized = normalizeExtractionText(text);
  if (!normalized) {
    return [];
  }

  const lines = normalized.split("\n");
  const inferred: Array<{ title: string; content: string }> = [];
  let currentTitle = "";
  let currentLines: string[] = [];
  let sawHeading = false;

  const pushCurrent = (): void => {
    const content = currentLines.join("\n").trim();
    if (!content) {
      return;
    }
    inferred.push({
      title: currentTitle || `Chapter ${inferred.length + 1}`,
      content,
    });
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    const previousBlank = index === 0 || lines[index - 1].trim() === "";

    if (previousBlank && isExplicitChapterHeading(trimmed)) {
      if (currentLines.join("\n").trim().length >= 300) {
        pushCurrent();
        currentLines = [];
      }
      currentTitle = trimmed;
      sawHeading = true;
      continue;
    }
    currentLines.push(line);
  }

  pushCurrent();

  if (!sawHeading || inferred.length < 2) {
    return [];
  }

  return inferred.map((chapter, index) => ({
    id: `inferred-${index + 1}`,
    title: chapter.title,
    content: chapter.content,
    wordCount: countWords(chapter.content),
    order: index,
    chapterNumber: index + 1,
  }));
}

function buildReferencePlotChapters(referenceText: string): OrderedChapter[] {
  const normalized = normalizeExtractionText(referenceText);
  if (!normalized) {
    return [];
  }

  const lines = normalized.split("\n");
  const inferred: Array<{ title: string; content: string }> = [];
  let currentTitle = "";
  let currentLines: string[] = [];

  const pushCurrent = (): void => {
    if (!currentTitle) {
      return;
    }

    const content = normalizeExtractionText(currentLines.join("\n"));
    if (!content || content.length < 120) {
      currentTitle = "";
      currentLines = [];
      return;
    }

    inferred.push({ title: currentTitle, content });
    currentTitle = "";
    currentLines = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (currentTitle) {
        currentLines.push(line);
      }
      continue;
    }

    if (isExplicitChapterHeading(trimmed)) {
      pushCurrent();
      currentTitle = trimmed;
      currentLines = [];
      continue;
    }

    if (currentTitle && isStoryBibleReferenceHeading(trimmed)) {
      pushCurrent();
      continue;
    }

    if (currentTitle) {
      currentLines.push(line);
    }
  }

  pushCurrent();

  return inferred.map((chapter, index) => ({
    id: `reference-plot-${index + 1}`,
    title: chapter.title,
    content: chapter.content,
    wordCount: countWords(chapter.content),
    order: index,
    chapterNumber: index + 1,
  }));
}

function getOutlineExtractionChapters(
  project: Project,
  explicitText?: string,
): OrderedChapter[] {
  const explicitSource = typeof explicitText === "string" ? explicitText : "";
  if (normalizeExtractionText(explicitSource)) {
    const split = splitNarrativeAndReferenceText(explicitSource);
    const referencePlotChapters = buildReferencePlotChapters(
      split.referenceText,
    );
    if (referencePlotChapters.length >= 2) {
      return referencePlotChapters;
    }

    const inferred = buildInferredExtractionChapters(
      split.narrativeText || split.fullText,
    );
    if (inferred.length > 1) {
      return inferred;
    }

    const content = split.narrativeText || split.fullText;
    return content
      ? [buildSyntheticOrderedChapter("Chapter 1", content, 1)]
      : [];
  }

  const concreteChapters = getOrderedProjectChapters(project)
    .map((chapter) => {
      const split = splitNarrativeAndReferenceText(chapter.content || "");
      return {
        ...chapter,
        content: split.narrativeText || split.fullText,
        wordCount: countWords(split.narrativeText || split.fullText),
      };
    })
    .filter(
      (chapter) => normalizeExtractionText(chapter.content || "").length > 0,
    );

  if (concreteChapters.length > 1) {
    return concreteChapters;
  }

  const combinedSource = concreteChapters[0]?.content || project.content || "";
  const split = splitNarrativeAndReferenceText(combinedSource);
  const referencePlotChapters = buildReferencePlotChapters(split.referenceText);
  if (referencePlotChapters.length >= 2) {
    return referencePlotChapters;
  }

  const inferred = buildInferredExtractionChapters(
    split.narrativeText || split.fullText,
  );
  if (inferred.length > 1) {
    return inferred;
  }

  const fallbackContent = split.narrativeText || split.fullText;
  if (!fallbackContent) {
    return [];
  }

  const fallbackTitle = concreteChapters[0]?.title || "Chapter 1";
  return [buildSyntheticOrderedChapter(fallbackTitle, fallbackContent, 1)];
}

function normalizeRelationshipEntries(
  value: unknown,
): Character["relationships"] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item) => item && typeof item === "object")
    .map((item) => {
      const relationship = item as Record<string, unknown>;
      return {
        ...(asString(relationship.characterId)
          ? { characterId: asString(relationship.characterId) }
          : {}),
        ...(asString(relationship.characterName)
          ? { characterName: asString(relationship.characterName) }
          : {}),
        type: asString(relationship.type),
        description: asString(relationship.description),
      } as Character["relationships"][number];
    })
    .filter((entry) => {
      const withName = entry as Character["relationships"][number] & {
        characterName?: string;
      };
      return Boolean(
        withName.characterId ||
        withName.characterName ||
        withName.type ||
        withName.description,
      );
    });
}

function normalizeCharacterPayload(character: Partial<Character>): Character {
  const candidate = character as Partial<Character> & {
    nicknames?: unknown;
    cognitiveFilter?: Record<string, unknown>;
  };
  const cognitiveSource = candidate.cognitiveFilter;
  const primaryMode = asString(cognitiveSource?.primaryMode);
  const cognitiveFilter =
    cognitiveSource && typeof cognitiveSource === "object"
      ? {
          primaryMode: ([
            "analytical",
            "emotional",
            "instinctive",
            "ritualistic",
            "detached",
            "sensory",
          ].includes(primaryMode)
            ? primaryMode
            : "analytical") as NonNullable<
            Character["cognitiveFilter"]
          >["primaryMode"],
          internalLanguage: asString(cognitiveSource.internalLanguage),
          blindSpot: asString(cognitiveSource.blindSpot),
          repeatingThoughtLoop: asString(cognitiveSource.repeatingThoughtLoop),
          forbiddenWords: asStringArray(cognitiveSource.forbiddenWords),
          signatureThoughts: asStringArray(cognitiveSource.signatureThoughts),
        }
      : undefined;

  return {
    id: asString(candidate.id) || crypto.randomUUID(),
    name: asString(candidate.name) || "Unknown Character",
    nicknames: asStringArray(candidate.nicknames),
    role: asString(candidate.role) || "minor",
    description: asString(candidate.description),
    backstory: asString(candidate.backstory),
    motivation: asString(candidate.motivation),
    fears: asStringArray(candidate.fears),
    flaw: asString(candidate.flaw),
    arc: asString(candidate.arc),
    voice: {
      vocabulary: asString(candidate.voice?.vocabulary) || "moderate",
      speechPatterns: asStringArray(candidate.voice?.speechPatterns),
      catchphrases: asStringArray(candidate.voice?.catchphrases),
    },
    relationships: normalizeRelationshipEntries(candidate.relationships),
    ...(cognitiveFilter ? { cognitiveFilter } : {}),
  };
}

function normalizeStoryBiblePayload(
  storyBible: Partial<StoryBible> | null | undefined,
): StoryBible {
  const defaults = createDefaultStoryBible();
  const candidate = storyBible || {};
  const normalizedCharacters = Array.isArray(candidate.characters)
    ? mergeCharacters(
        [],
        candidate.characters
          .filter((item) => item && typeof item === "object")
          .map((item) => normalizeCharacterPayload(item as Partial<Character>)),
      )
    : defaults.characters;
  const normalizedWorld: StoryBible["world"] = {
    setting: asString(candidate.world?.setting) || defaults.world.setting,
    timePeriod:
      asString(candidate.world?.timePeriod) || defaults.world.timePeriod,
    locations: Array.isArray(candidate.world?.locations)
      ? candidate.world.locations
          .filter((item) => item && typeof item === "object")
          .map((item) => {
            const location = item as unknown as Record<string, unknown>;
            return {
              name: asString(location.name),
              description: asString(location.description),
              significance: asString(location.significance),
            };
          })
          .filter(
            (location) =>
              location.name || location.description || location.significance,
          )
      : defaults.world.locations,
    rules: asStringArray(candidate.world?.rules),
  };
  const normalizedChapterOutlines = attachCharactersToChapterOutlines(
    (Array.isArray(candidate.chapterOutlines)
      ? candidate.chapterOutlines
          .filter((item) => item && typeof item === "object")
          .map((item, index) => {
            const outline = item as Partial<ChapterOutline>;
            return normalizeLooseChapterOutline({
              chapterNumber: Number(outline.chapterNumber) || index + 1,
              title: asString(outline.title),
              summary: asString(outline.summary),
              beats: asStringArray(outline.beats),
              characters: canonicalizeCharacterReferences(
                asStringArray(outline.characters),
                normalizedCharacters,
              ),
              location: asString(outline.location),
              timeframe: asString(outline.timeframe),
            });
          })
      : defaults.chapterOutlines
    ).map((outline) => enrichChapterOutlineAnchors(outline, normalizedWorld)),
    normalizedCharacters,
  ).map((outline) => ({
    ...outline,
    characters: canonicalizeCharacterReferences(
      outline.characters,
      normalizedCharacters,
    ),
  }));

  return {
    premise: {
      logline: asString(candidate.premise?.logline) || defaults.premise.logline,
      synopsis:
        asString(candidate.premise?.synopsis) || defaults.premise.synopsis,
      themes: asStringArray(candidate.premise?.themes),
      tone: asString(candidate.premise?.tone) || defaults.premise.tone,
      genre: asString(candidate.premise?.genre) || defaults.premise.genre,
    },
    characters: normalizedCharacters,
    world: normalizedWorld,
    plotStructure: {
      acts: Array.isArray(candidate.plotStructure?.acts)
        ? candidate.plotStructure.acts
            .filter((item) => item && typeof item === "object")
            .map((item) => {
              const act = item as unknown as Record<string, unknown>;
              const parsedNumber = Number(act.number);
              const chapterRange = act.chapterRange as
                | Record<string, unknown>
                | undefined;
              const chapterRangeStart = Number(chapterRange?.start);
              const chapterRangeEnd = Number(chapterRange?.end);
              return {
                number: Number.isFinite(parsedNumber) ? parsedNumber : 0,
                name: asString(act.name),
                description: asString(act.description),
                keyEvents: asStringArray(act.keyEvents),
                ...(Number.isFinite(chapterRangeStart) &&
                Number.isFinite(chapterRangeEnd)
                  ? {
                      chapterRange: {
                        start: chapterRangeStart,
                        end: chapterRangeEnd,
                      },
                    }
                  : {}),
              };
            })
            .filter(
              (act) =>
                act.number ||
                act.name ||
                act.description ||
                act.keyEvents.length,
            )
        : defaults.plotStructure.acts,
      plotThreads: Array.isArray(candidate.plotStructure?.plotThreads)
        ? candidate.plotStructure.plotThreads
            .filter((item) => item && typeof item === "object")
            .map((item) => {
              const thread = item as unknown as Record<string, unknown>;
              const introducedIn = Number(thread.introducedIn);
              const resolvedIn =
                thread.resolvedIn == null ? null : Number(thread.resolvedIn);
              const tension = asString(thread.tension);
              return {
                id: asString(thread.id) || crypto.randomUUID(),
                name: asString(thread.name),
                type: asString(thread.type),
                description: asString(thread.description),
                status: asString(thread.status),
                ...(Number.isFinite(introducedIn) ? { introducedIn } : {}),
                ...(resolvedIn == null || Number.isFinite(resolvedIn)
                  ? { resolvedIn }
                  : {}),
                ...(tension
                  ? {
                      tension: tension as NonNullable<
                        StoryBible["plotStructure"]["plotThreads"][number]["tension"]
                      >,
                    }
                  : {}),
                keyCharacters: asStringArray(thread.keyCharacters),
                currentState: asString(thread.currentState),
                nextMilestone: asString(thread.nextMilestone),
                relatedThreads: asStringArray(thread.relatedThreads),
                beats: asStringArray(thread.beats),
              };
            })
            .filter(
              (thread) =>
                thread.name ||
                thread.description ||
                thread.status ||
                thread.keyCharacters.length,
            )
        : defaults.plotStructure.plotThreads,
    },
    chapterOutlines: normalizedChapterOutlines,
    styleDirectives: {
      pov:
        asString(candidate.styleDirectives?.pov) ||
        defaults.styleDirectives.pov,
      tense:
        asString(candidate.styleDirectives?.tense) ||
        defaults.styleDirectives.tense,
      proseStyle:
        asString(candidate.styleDirectives?.proseStyle) ||
        defaults.styleDirectives.proseStyle,
      dialogueStyle:
        asString(candidate.styleDirectives?.dialogueStyle) ||
        defaults.styleDirectives.dialogueStyle,
    },
  };
}

function preferRicherText(candidate: string, existing: string): string {
  if (!candidate) {
    return existing;
  }
  if (!existing) {
    return candidate;
  }
  return candidate.length >= existing.length ? candidate : existing;
}

function isGenericChapterTitle(title: string): boolean {
  return /^chapter\s+\d+$/i.test(normalizeExtractionText(title));
}

function preferChapterTitle(candidate: string, existing: string): string {
  const normalizedCandidate = normalizeExtractionText(candidate);
  const normalizedExisting = normalizeExtractionText(existing);

  if (!normalizedCandidate) {
    return normalizedExisting;
  }
  if (!normalizedExisting) {
    return normalizedCandidate;
  }

  const candidateGeneric = isGenericChapterTitle(normalizedCandidate);
  const existingGeneric = isGenericChapterTitle(normalizedExisting);

  if (candidateGeneric !== existingGeneric) {
    return existingGeneric ? normalizedCandidate : normalizedExisting;
  }

  return preferRicherText(normalizedCandidate, normalizedExisting);
}

function mergeUniqueStrings(...groups: string[][]): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const group of groups) {
    for (const item of group) {
      const trimmed = item.trim();
      if (!trimmed) {
        continue;
      }
      const key = trimmed.toLowerCase();
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      merged.push(trimmed);
    }
  }
  return merged;
}

function canonicalizeCharacterReferences(
  names: string[],
  characters: Character[],
): string[] {
  return mergeUniqueStrings(
    names
      .map((name) => normalizeExtractionText(name))
      .filter(Boolean)
      .map((name) => findExistingCharacter(characters, name)?.name || name),
  );
}

function enrichChapterOutlineAnchors(
  outline: ChapterOutline,
  world?: StoryBible["world"],
): ChapterOutline {
  const outlineText = `${outline.title}\n${outline.summary}\n${outline.beats.join("\n")}`;
  return {
    ...outline,
    location:
      normalizeExtractionText(outline.location || "") ||
      inferChapterLocationFromText(outlineText, world),
    timeframe:
      normalizeExtractionText(outline.timeframe || "") ||
      inferChapterTimeframeFromText(outlineText, world?.timePeriod),
  };
}

function mergeLocations(
  existingLocations: StoryBible["world"]["locations"],
  extractedLocations: StoryBible["world"]["locations"],
): StoryBible["world"]["locations"] {
  const merged = new Map<string, StoryBible["world"]["locations"][number]>();

  for (const location of existingLocations) {
    const key = location.name.trim().toLowerCase();
    if (!key) {
      continue;
    }
    merged.set(key, location);
  }

  for (const location of extractedLocations) {
    const key = location.name.trim().toLowerCase();
    if (!key) {
      continue;
    }
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, location);
      continue;
    }
    merged.set(key, {
      ...existing,
      ...location,
      description: preferRicherText(location.description, existing.description),
      significance: preferRicherText(
        location.significance,
        existing.significance,
      ),
    });
  }

  return Array.from(merged.values());
}

function mergeActs(
  existingActs: StoryBible["plotStructure"]["acts"],
  extractedActs: StoryBible["plotStructure"]["acts"],
): StoryBible["plotStructure"]["acts"] {
  const merged = new Map<number, StoryBible["plotStructure"]["acts"][number]>();

  for (const act of existingActs) {
    if (act.number > 0) {
      merged.set(act.number, act);
    }
  }

  for (const act of extractedActs) {
    if (act.number <= 0) {
      continue;
    }
    const existing = merged.get(act.number);
    if (!existing) {
      merged.set(act.number, act);
      continue;
    }
    merged.set(act.number, {
      ...existing,
      ...act,
      name: preferRicherText(act.name, existing.name),
      description: preferRicherText(act.description, existing.description),
      keyEvents: mergeUniqueStrings(existing.keyEvents, act.keyEvents),
      ...(act.chapterRange || existing.chapterRange
        ? {
            chapterRange: {
              start:
                act.chapterRange?.start || existing.chapterRange?.start || 1,
              end:
                act.chapterRange?.end ||
                existing.chapterRange?.end ||
                act.chapterRange?.start ||
                existing.chapterRange?.start ||
                1,
            },
          }
        : {}),
    });
  }

  return Array.from(merged.values()).sort(
    (left, right) => left.number - right.number,
  );
}

function mergePlotThreads(
  existingThreads: StoryBible["plotStructure"]["plotThreads"],
  extractedThreads: StoryBible["plotStructure"]["plotThreads"],
): StoryBible["plotStructure"]["plotThreads"] {
  const merged = new Map<
    string,
    StoryBible["plotStructure"]["plotThreads"][number]
  >();

  for (const thread of existingThreads) {
    const key = (thread.id || thread.name).trim().toLowerCase();
    if (!key) {
      continue;
    }
    merged.set(key, thread);
  }

  for (const thread of extractedThreads) {
    const key = (thread.id || thread.name).trim().toLowerCase();
    if (!key) {
      continue;
    }
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, thread);
      continue;
    }
    merged.set(key, {
      ...existing,
      ...thread,
      name: preferRicherText(thread.name, existing.name),
      description: preferRicherText(thread.description, existing.description),
      status: preferRicherText(thread.status, existing.status),
      currentState: preferRicherText(
        thread.currentState || "",
        existing.currentState || "",
      ),
      nextMilestone: preferRicherText(
        thread.nextMilestone || "",
        existing.nextMilestone || "",
      ),
      keyCharacters: mergeUniqueStrings(
        existing.keyCharacters || [],
        thread.keyCharacters || [],
      ),
      relatedThreads: mergeUniqueStrings(
        existing.relatedThreads || [],
        thread.relatedThreads || [],
      ),
      beats: mergeUniqueStrings(existing.beats || [], thread.beats || []),
    });
  }

  return Array.from(merged.values());
}

function mergeCharacters(
  existingCharacters: Character[],
  extractedCharacters: Character[],
): Character[] {
  const merged = existingCharacters.map((character) =>
    normalizeCharacterPayload(character),
  );

  for (const extractedCharacter of extractedCharacters) {
    const normalizedCharacter = normalizeCharacterPayload(extractedCharacter);
    const existing = findExistingCharacter(merged, normalizedCharacter.name);
    if (!existing) {
      merged.push(normalizedCharacter);
      continue;
    }

    const characterIndex = merged.findIndex(
      (character) => character.id === existing.id,
    );
    merged[characterIndex] = normalizeCharacterPayload(
      enrichCharacter(existing, normalizedCharacter),
    );
  }

  return merged;
}

function mergeStoryBible(
  existing: StoryBible,
  extracted: StoryBible,
): StoryBible {
  return normalizeStoryBiblePayload({
    premise: {
      logline: preferRicherText(
        extracted.premise.logline,
        existing.premise.logline,
      ),
      synopsis: preferRicherText(
        extracted.premise.synopsis,
        existing.premise.synopsis,
      ),
      themes: mergeUniqueStrings(
        existing.premise.themes,
        extracted.premise.themes,
      ),
      tone: preferRicherText(extracted.premise.tone, existing.premise.tone),
      genre: preferRicherText(extracted.premise.genre, existing.premise.genre),
    },
    characters: mergeCharacters(existing.characters, extracted.characters),
    world: {
      setting: preferRicherText(
        extracted.world.setting,
        existing.world.setting,
      ),
      timePeriod: preferRicherText(
        extracted.world.timePeriod,
        existing.world.timePeriod,
      ),
      locations: mergeLocations(
        existing.world.locations,
        extracted.world.locations,
      ),
      rules: mergeUniqueStrings(existing.world.rules, extracted.world.rules),
    },
    plotStructure: {
      acts: mergeActs(
        existing.plotStructure.acts,
        extracted.plotStructure.acts,
      ),
      plotThreads: mergePlotThreads(
        existing.plotStructure.plotThreads,
        extracted.plotStructure.plotThreads,
      ),
    },
    chapterOutlines: mergeChapterOutlines(
      existing.chapterOutlines,
      extracted.chapterOutlines,
    ),
    styleDirectives: {
      pov: preferRicherText(
        extracted.styleDirectives.pov,
        existing.styleDirectives.pov,
      ),
      tense: preferRicherText(
        extracted.styleDirectives.tense,
        existing.styleDirectives.tense,
      ),
      proseStyle: preferRicherText(
        extracted.styleDirectives.proseStyle,
        existing.styleDirectives.proseStyle,
      ),
      dialogueStyle: preferRicherText(
        extracted.styleDirectives.dialogueStyle,
        existing.styleDirectives.dialogueStyle,
      ),
    },
  });
}

function normalizeLooseChapterOutline(
  outline: Partial<ChapterOutline>,
): ChapterOutline {
  const chapterNumber = Number(outline.chapterNumber);
  const title = normalizeExtractionText(outline.title || "");
  const characters = asStringArray(outline.characters).map((character) =>
    normalizeExtractionText(character),
  );
  const rawSummary = normalizeExtractionText(outline.summary || "");
  const beats = normalizeSynopsisGeneratedBeats({
    beats: asStringArray(outline.beats),
    summary: rawSummary,
    pov: characters[0],
  });

  return {
    chapterNumber: Number.isFinite(chapterNumber) ? chapterNumber : 1,
    title: preferChapterTitle(title, `Chapter ${chapterNumber || 1}`),
    summary: buildSynopsisDrivenChapterSummary({
      chapterNumber: Number.isFinite(chapterNumber) ? chapterNumber : 1,
      title,
      summary: rawSummary,
      beats,
    }),
    beats,
    characters,
    location: normalizeExtractionText(outline.location || ""),
    timeframe: normalizeExtractionText(outline.timeframe || ""),
  };
}

function scoreChapterOutlineRichness(outline: ChapterOutline): number {
  const summary = normalizeExtractionText(outline.summary || "");
  const beats = (outline.beats || [])
    .map((beat) => normalizeExtractionText(beat))
    .filter(Boolean);

  let score = 0;
  score += Math.min(summary.length, 600);
  score += beats.reduce((total, beat) => total + Math.min(beat.length, 220), 0);
  score += beats.length * 80;
  score += (outline.characters || []).length * 20;
  if (splitIntoSentences(summary).length >= 2) {
    score += 120;
  }
  if (outline.location) {
    score += 40;
  }
  if (outline.timeframe) {
    score += 20;
  }
  if (!isGenericChapterTitle(outline.title)) {
    score += 30;
  }
  return score;
}

function mergeChapterOutlines(
  existing: StoryBible["chapterOutlines"],
  extracted: StoryBible["chapterOutlines"],
): StoryBible["chapterOutlines"] {
  const merged = new Map<number, ChapterOutline>();

  for (const outline of existing) {
    const normalized = normalizeLooseChapterOutline(outline);
    merged.set(normalized.chapterNumber, normalized);
  }

  for (const outline of extracted) {
    const normalized = normalizeLooseChapterOutline(outline);
    const current = merged.get(normalized.chapterNumber);
    if (!current) {
      merged.set(normalized.chapterNumber, normalized);
      continue;
    }

    const betterBeats =
      scoreChapterOutlineRichness({
        ...current,
        beats: normalized.beats,
      }) >=
      scoreChapterOutlineRichness({
        ...current,
        beats: current.beats,
      })
        ? normalized.beats
        : current.beats;

    const candidate: ChapterOutline = {
      chapterNumber: normalized.chapterNumber,
      title: preferChapterTitle(normalized.title, current.title),
      summary: preferRicherText(normalized.summary, current.summary),
      beats: betterBeats.length ? betterBeats : current.beats,
      characters: mergeUniqueStrings(current.characters, normalized.characters),
      location: preferRicherText(normalized.location, current.location),
      timeframe: preferRicherText(normalized.timeframe, current.timeframe),
    };

    merged.set(
      normalized.chapterNumber,
      scoreChapterOutlineRichness(candidate) >=
        scoreChapterOutlineRichness(current)
        ? candidate
        : current,
    );
  }

  return Array.from(merged.values()).sort(
    (left, right) => left.chapterNumber - right.chapterNumber,
  );
}

function summarizeChapterText(text: string, maxSentences = 2): string {
  const sentences = normalizeExtractionText(text)
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  return sentences.slice(0, maxSentences).join(" ").trim();
}

function buildFallbackChapterOutline(chapter: OrderedChapter): ChapterOutline {
  const normalized = normalizeExtractionText(chapter.content || "");
  const rawSummary = summarizeChapterText(normalized, 4);
  const textDerivedBeats = buildRichBeatsFromText(normalized, 4, 8);
  const fallbackParagraphBeats = normalized
    .split(/\n{2,}/)
    .map((section) => section.replace(/\s+/g, " ").trim())
    .filter((section) => section.length > 40)
    .slice(0, 8)
    .map((section) =>
      section.length > 280 ? `${section.slice(0, 277).trimEnd()}...` : section,
    );
  const beats = normalizeSynopsisGeneratedBeats({
    beats:
      textDerivedBeats.length > 0 ? textDerivedBeats : fallbackParagraphBeats,
    summary: rawSummary,
  });

  return {
    chapterNumber: chapter.chapterNumber,
    title: chapter.title || `Chapter ${chapter.chapterNumber}`,
    summary: rawSummary,
    beats,
    characters: [],
    location: "",
    timeframe: "",
  };
}

function buildMinimalChapterOutline(chapter: OrderedChapter): ChapterOutline {
  return {
    chapterNumber: chapter.chapterNumber,
    title: chapter.title || `Chapter ${chapter.chapterNumber}`,
    summary: "",
    beats: [],
    characters: [],
    location: "",
    timeframe: "",
  };
}

function buildRepresentativeExcerpt(text: string, maxChars: number): string {
  const normalized = normalizeExtractionText(text);
  if (normalized.length <= maxChars) {
    return normalized;
  }

  const sectionChars = Math.max(1000, Math.floor((maxChars - 48) / 3));
  const middleStart = Math.max(
    0,
    Math.floor(normalized.length / 2) - Math.floor(sectionChars / 2),
  );

  return [
    normalized.slice(0, sectionChars),
    normalized.slice(middleStart, middleStart + sectionChars),
    normalized.slice(-sectionChars),
  ].join("\n\n");
}

function normalizeChapterOutlinePayload(
  outline: Partial<ChapterOutline> | undefined,
  chapter: OrderedChapter,
  allowFallbacks = true,
): ChapterOutline {
  const fallback = buildFallbackChapterOutline(chapter);
  const normalized = normalizeLooseChapterOutline({
    chapterNumber: Number(outline?.chapterNumber),
    title: asString(outline?.title) || fallback.title,
    summary: asString(outline?.summary),
    beats: asStringArray(outline?.beats),
    characters: asStringArray(outline?.characters),
    location: asString(outline?.location),
    timeframe: asString(outline?.timeframe),
  });
  return {
    chapterNumber: normalized.chapterNumber || fallback.chapterNumber,
    title: normalized.title || fallback.title,
    summary: allowFallbacks
      ? isWeakChapterSummary(normalized.summary)
        ? fallback.summary
        : normalized.summary || fallback.summary
      : normalized.summary,
    beats: allowFallbacks
      ? areWeakChapterBeats(normalized.beats)
        ? fallback.beats
        : normalized.beats
      : normalized.beats,
    characters: normalized.characters,
    location: allowFallbacks
      ? normalized.location || fallback.location
      : normalized.location,
    timeframe: allowFallbacks
      ? normalized.timeframe || fallback.timeframe
      : normalized.timeframe,
  };
}

function normalizeExtractionText(text: string): string {
  return htmlToPlainText(text || "", {
    wordwrap: false,
    selectors: [
      { selector: "a", options: { ignoreHref: true } },
      { selector: "img", format: "skip" },
    ],
  })
    .replace(/^\s*```(?:\w+)?\s*$/gm, "")
    .replace(/^\s*(?:[-*_=]\s*){3,}\s*$/gm, "")
    .replace(/^\s*==+\s*(.*?)\s*==+\s*$/gm, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

function normalizeStructuredSourceText(text: string): string {
  return htmlToPlainText(text || "", {
    wordwrap: false,
    selectors: [
      { selector: "a", options: { ignoreHref: true } },
      { selector: "img", format: "skip" },
    ],
  })
    .replace(/^\s*```(?:\w+)?\s*$/gm, "")
    .replace(/^\s*(?:[-*_=]\s*){3,}\s*$/gm, "")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

const ORDINAL_NUMBER_WORDS = new Map<string, number>([
  ["one", 1],
  ["two", 2],
  ["three", 3],
  ["four", 4],
  ["five", 5],
  ["six", 6],
  ["seven", 7],
  ["eight", 8],
  ["nine", 9],
  ["ten", 10],
  ["eleven", 11],
  ["twelve", 12],
  ["thirteen", 13],
  ["fourteen", 14],
  ["fifteen", 15],
  ["sixteen", 16],
  ["seventeen", 17],
  ["eighteen", 18],
  ["nineteen", 19],
  ["twenty", 20],
]);

const NUMBER_WORD_BY_VALUE = new Map<number, string>(
  Array.from(ORDINAL_NUMBER_WORDS.entries()).map(([word, value]) => [
    value,
    word,
  ]),
);

const GENERIC_CHARACTER_ROLE_TOKENS = new Set([
  "assistant",
  "candidate",
  "doctor",
  "intern",
  "officer",
  "patient",
  "professor",
  "researcher",
  "scientist",
  "staffer",
  "student",
  "teacher",
  "technician",
  "victim",
  "witness",
]);

const GENERIC_CHARACTER_DESCRIPTOR_TOKENS = new Set([
  "american",
  "british",
  "chemistry",
  "doctoral",
  "female",
  "foreign",
  "graduate",
  "junior",
  "lab",
  "lead",
  "local",
  "male",
  "older",
  "postdoctoral",
  "postdoc",
  "principal",
  "research",
  "russian",
  "senior",
  "undergraduate",
  "visiting",
  "young",
  "younger",
]);

function parseRomanNumeral(value: string): number | null {
  if (!/^[IVXLCDM]+$/i.test(value)) {
    return null;
  }

  const numerals: Record<string, number> = {
    I: 1,
    V: 5,
    X: 10,
    L: 50,
    C: 100,
    D: 500,
    M: 1000,
  };

  let total = 0;
  let previous = 0;
  for (const char of value.toUpperCase().split("").reverse()) {
    const current = numerals[char];
    if (!current) return null;
    if (current < previous) {
      total -= current;
    } else {
      total += current;
      previous = current;
    }
  }

  return total > 0 ? total : null;
}

function parseOrdinalToken(value: string): number | null {
  const normalized = value.trim().replace(/[.:]/g, "").toLowerCase();
  if (!normalized) {
    return null;
  }
  if (/^\d+$/.test(normalized)) {
    return Number(normalized);
  }
  if (ORDINAL_NUMBER_WORDS.has(normalized)) {
    return ORDINAL_NUMBER_WORDS.get(normalized) ?? null;
  }
  return parseRomanNumeral(normalized);
}

function splitIntoSentences(text: string): string[] {
  return normalizeExtractionText(text)
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function clampRichText(text: string, maxChars: number): string {
  const normalized = normalizeExtractionText(text);
  if (normalized.length <= maxChars) {
    return normalized;
  }

  const sentences = splitIntoSentences(normalized);
  if (sentences.length > 1) {
    let preserved = "";
    for (const sentence of sentences) {
      const candidate = preserved ? `${preserved} ${sentence}` : sentence;
      if (candidate.length > maxChars) {
        break;
      }
      preserved = candidate;
    }
    if (preserved.length >= Math.max(80, Math.floor(maxChars * 0.55))) {
      return preserved.trim();
    }
  }

  const withinLimit = normalized.slice(0, maxChars).trimEnd();
  const punctuationBoundary = Math.max(
    withinLimit.lastIndexOf(". "),
    withinLimit.lastIndexOf("! "),
    withinLimit.lastIndexOf("? "),
    withinLimit.lastIndexOf("; "),
  );
  if (punctuationBoundary >= Math.max(60, Math.floor(maxChars * 0.5))) {
    return withinLimit.slice(0, punctuationBoundary + 1).trimEnd();
  }

  const wordBoundary = withinLimit.lastIndexOf(" ");
  const clipped =
    wordBoundary >= Math.max(40, Math.floor(maxChars * 0.5))
      ? withinLimit.slice(0, wordBoundary).trimEnd()
      : withinLimit;
  return /[.!?]$/.test(clipped) ? clipped : `${clipped}.`;
}

const LOCATION_NAME_HINT_PATTERN =
  /\b([A-Z][A-Za-z0-9'’.-]*(?:\s+[A-Z][A-Za-z0-9'’.-]*){0,3}\s(?:Gulch|Street|Road|Trail|Saloon|Office|Church|Mine|Courtyard|Tower|Garden|Clinic|Junction|Crater|Tomb|Palace|Quarters|Room|Square|Town|Station|Depot|Bridge|Ranch|Canyon|Highway|Camp|Gallows))\b/g;

const CHAPTER_TIMEFRAME_HINTS: Array<[RegExp, string]> = [
  [/\bpre-?dawn\b|\bbefore dawn\b/i, "pre-dawn"],
  [/\bdawn\b|\bdaybreak\b/i, "dawn"],
  [/\bmorning\b/i, "morning"],
  [/\bnoon\b|\bmidday\b/i, "midday"],
  [/\bafternoon\b/i, "afternoon"],
  [/\bdusk\b|\btwilight\b/i, "dusk"],
  [/\bevening\b|\bsunset\b/i, "evening"],
  [/\bnight\b|\bmoonrise\b|\bmoonlight\b|\bsleepless night\b/i, "night"],
];

function extractPrimarySettingName(setting: string): string {
  const normalized = normalizeExtractionText(setting);
  if (!normalized) {
    return "";
  }

  const firstClause = normalized.split(/[.;]/)[0]?.split(",")[0]?.trim();
  if (!firstClause || firstClause.length > 80) {
    return "";
  }
  return firstClause;
}

function condenseTimeframeLabel(timeframe: string): string {
  const normalized = normalizeExtractionText(timeframe);
  if (!normalized) {
    return "";
  }

  const relativeMatch = normalized.match(
    /\b(?:moments?|hours?|days?|weeks?|months?|years?)\s+(?:after|before)\s+[^,.;]+/i,
  );
  if (relativeMatch?.[0]) {
    return relativeMatch[0];
  }

  const periodMatch = normalized.match(
    /\bin the aftermath of [^,.;]+|\bduring [^,.;]+/i,
  );
  if (periodMatch?.[0]) {
    return periodMatch[0];
  }

  const firstClause = normalized.split(/[.;]/)[0]?.trim() || normalized;
  return firstClause.length <= 90 ? firstClause : "";
}

function inferChapterLocationFromText(
  text: string,
  world?: StoryBible["world"],
): string {
  const haystack = normalizeExtractionText(text);
  const scored = new Map<string, number>();
  const score = (name: string, weight = 1): void => {
    const normalizedName = normalizeExtractionText(name);
    if (!normalizedName) {
      return;
    }
    scored.set(normalizedName, (scored.get(normalizedName) || 0) + weight);
  };

  if (world) {
    for (const location of world.locations || []) {
      const name = normalizeExtractionText(location.name);
      if (!name) {
        continue;
      }
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (new RegExp(`\\b${escaped}\\b`, "i").test(haystack)) {
        score(name, 3);
      }
    }

    const primarySetting = extractPrimarySettingName(world.setting);
    if (primarySetting) {
      const escaped = primarySetting.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (new RegExp(`\\b${escaped}\\b`, "i").test(haystack)) {
        score(primarySetting, 2);
      } else {
        score(primarySetting, 0.5);
      }
    }
  }

  for (const match of haystack.matchAll(LOCATION_NAME_HINT_PATTERN)) {
    if (match[1]) {
      score(match[1], 1);
    }
  }

  const ranked = [...scored.entries()].sort((left, right) => {
    if (right[1] !== left[1]) {
      return right[1] - left[1];
    }
    return right[0].length - left[0].length;
  });

  return ranked[0]?.[0] || "";
}

function inferChapterTimeframeFromText(
  text: string,
  worldTimePeriod?: string,
): string {
  const haystack = normalizeExtractionText(text);
  for (const [pattern, label] of CHAPTER_TIMEFRAME_HINTS) {
    if (pattern.test(haystack)) {
      return label;
    }
  }

  return condenseTimeframeLabel(worldTimePeriod || "");
}

const GENERATED_BEAT_SCAFFOLD_PATTERNS = [
  /\bscene shows characters responding\b/i,
  /\bwith specific actions and consequences\b/i,
  /^\s*(?:beat|scene)\s+\d+\b/i,
];

function stripTrailingSentencePunctuation(text: string): string {
  return normalizeExtractionText(text)
    .replace(/[.!?]+$/g, "")
    .trim();
}

function lowercaseInitial(text: string): string {
  if (!text) {
    return "";
  }
  return `${text.charAt(0).toLowerCase()}${text.slice(1)}`;
}

function joinCharacterNames(names: string[]): string {
  const cleaned = names
    .map((name) => normalizeExtractionText(name))
    .filter(Boolean)
    .slice(0, 3);

  if (cleaned.length === 0) {
    return "";
  }
  if (cleaned.length === 1) {
    return cleaned[0];
  }
  if (cleaned.length === 2) {
    return `${cleaned[0]} and ${cleaned[1]}`;
  }
  return `${cleaned.slice(0, -1).join(", ")}, and ${cleaned[cleaned.length - 1]}`;
}

function isLabelLikeGeneratedBeat(text: string): boolean {
  const normalized = normalizeExtractionText(text);
  if (!normalized) {
    return true;
  }

  if (
    GENERATED_BEAT_SCAFFOLD_PATTERNS.some((pattern) => pattern.test(normalized))
  ) {
    return true;
  }

  const sentenceCount = splitIntoSentences(normalized).length;
  const wordCount = normalized.split(/\s+/).filter(Boolean).length;
  return sentenceCount <= 1 && wordCount <= 12 && !/[,:;]/.test(normalized);
}

function isStructurallyWeakGeneratedBeat(text: string): boolean {
  const normalized = normalizeExtractionText(text);
  if (!normalized) {
    return true;
  }

  if (isLabelLikeGeneratedBeat(normalized)) {
    return true;
  }

  const sentenceCount = splitIntoSentences(normalized).length;
  const wordCount = normalized.split(/\s+/).filter(Boolean).length;

  if (sentenceCount < 2) {
    return true;
  }

  if (sentenceCount === 2 && wordCount < 26) {
    return true;
  }

  return false;
}

function sanitizeGeneratedSceneBeats(beats: string[]): string[] {
  return beats
    .map((beat) => clampRichText(beat, 420))
    .filter((beat) => !isStructurallyWeakGeneratedBeat(beat));
}

// Build chapter-scoped fallback beats that preserve the event while adding mood and forward pressure.
function buildActDrivenSceneBeat(options: {
  event: string;
  previousEvent?: string;
  nextEvent?: string;
  act: StoryAct;
  characters: string[];
  tone?: string;
  synopsis?: string;
  setting?: string;
  threadStatus: string[];
}): string {
  const eventText = normalizeExtractionText(options.event);
  if (!eventText) {
    return "";
  }

  const castNames = joinCharacterNames(options.characters);
  const castClause = castNames
    ? ` as ${castNames} ${options.characters.length === 1 ? "is" : "are"} forced to answer it in motion`
    : " as the characters in play are forced to answer it in motion";

  const eventSentence = /[.!?]$/.test(eventText)
    ? eventText
    : `The scene turns on ${stripTrailingSentencePunctuation(eventText)}${castClause}.`;

  const emotionalSource =
    splitIntoSentences(options.act.description)[0] ||
    splitIntoSentences(options.synopsis || "")[0] ||
    "";
  const toneText = stripTrailingSentencePunctuation(options.tone || "");
  const settingAnchor =
    splitIntoSentences(options.setting || "")[0] ||
    stripTrailingSentencePunctuation(options.setting || "");

  const sentences = [eventSentence];

  if (toneText && emotionalSource) {
    sentences.push(
      `The emotional current is ${lowercaseInitial(toneText)}, shaped by the fact that ${lowercaseInitial(stripTrailingSentencePunctuation(emotionalSource))}.`,
    );
  } else if (emotionalSource) {
    sentences.push(
      `The scene carries the pressure of ${lowercaseInitial(stripTrailingSentencePunctuation(emotionalSource))}.`,
    );
  } else if (toneText) {
    sentences.push(`The emotional current is ${lowercaseInitial(toneText)}.`);
  }

  if (settingAnchor && settingAnchor.length <= 140) {
    sentences.push(
      `It unfolds against ${lowercaseInitial(stripTrailingSentencePunctuation(settingAnchor))}.`,
    );
  }

  if (options.previousEvent) {
    sentences.push(
      `It still carries the residue of ${stripTrailingSentencePunctuation(options.previousEvent)}.`,
    );
  }

  if (options.nextEvent) {
    sentences.push(
      `The fallout builds immediate pressure toward ${stripTrailingSentencePunctuation(options.nextEvent)}.`,
    );
  } else if (options.threadStatus.length > 0) {
    sentences.push(
      `The fallout sharpens these plot pressures: ${options.threadStatus.join("; ")}.`,
    );
  } else {
    sentences.push(
      `The fallout pushes the chapter deeper into ${options.act.name || `Act ${options.act.number}`}.`,
    );
  }

  return clampRichText(sentences.filter(Boolean).join(" "), 420);
}

function buildActDrivenSceneBeats(options: {
  act: StoryAct;
  events: string[];
  startIndex: number;
  chapterCount: number;
  characters: string[];
  tone?: string;
  synopsis?: string;
  setting?: string;
  threadStatus: string[];
}): string[] {
  const chapterEvents = options.events
    .slice(options.startIndex, options.startIndex + options.chapterCount)
    .slice(0, 3);

  return sanitizeGeneratedSceneBeats(
    chapterEvents.map((event, localIndex) => {
      const globalIndex = options.startIndex + localIndex;
      return buildActDrivenSceneBeat({
        event,
        previousEvent:
          globalIndex > 0 ? options.events[globalIndex - 1] : undefined,
        nextEvent:
          globalIndex < options.events.length - 1
            ? options.events[globalIndex + 1]
            : undefined,
        act: options.act,
        characters: options.characters,
        tone: options.tone,
        synopsis: options.synopsis,
        setting: options.setting,
        threadStatus: options.threadStatus,
      });
    }),
  );
}

function isWeakChapterSummary(summary: string): boolean {
  const normalized = normalizeExtractionText(summary);
  if (!normalized) {
    return true;
  }
  return splitIntoSentences(normalized).length < 3 || normalized.length < 220;
}

function areWeakChapterBeats(beats: string[]): boolean {
  const normalized = beats
    .map((beat) => normalizeExtractionText(beat))
    .filter(Boolean);
  if (normalized.length === 0) {
    return true;
  }

  const richBeatCount = normalized.filter(
    (beat) => !isStructurallyWeakGeneratedBeat(beat),
  ).length;

  return richBeatCount < Math.ceil(normalized.length / 2);
}

function buildSynopsisDrivenBeat(options: {
  beat: string;
  summary: string;
  previousBeat?: string;
  nextBeat?: string;
  pov?: string;
}): string {
  const beatText = normalizeExtractionText(options.beat);
  if (!beatText) {
    return "";
  }

  const summaryPressure = splitIntoSentences(options.summary)[0] || "";
  const subject = normalizeExtractionText(options.pov || "");
  const eventSentence = /[.!?]$/.test(beatText)
    ? beatText
    : `The scene turns on ${stripTrailingSentencePunctuation(beatText)}${subject ? ` as ${subject} is forced to act` : " as the pressure sharpens"}.`;

  const sentences = [eventSentence];

  if (summaryPressure) {
    sentences.push(
      `It carries the chapter pressure of ${lowercaseInitial(stripTrailingSentencePunctuation(summaryPressure))}.`,
    );
  } else {
    sentences.push(
      "The emotional pressure should stay immediate and scene-bound rather than collapsing into summary.",
    );
  }
  if (options.previousBeat) {
    sentences.push(
      `It grows out of ${stripTrailingSentencePunctuation(options.previousBeat)}.`,
    );
  } else {
    sentences.push(
      "It should open with tension already in the air, as if the chapter has entered mid-pressure rather than from a standstill.",
    );
  }
  if (options.nextBeat) {
    sentences.push(
      `It creates immediate pressure toward ${stripTrailingSentencePunctuation(options.nextBeat)}.`,
    );
  } else {
    sentences.push(
      "Its consequence should leave the chapter more unstable than it was at the start of the beat.",
    );
  }

  return clampRichText(sentences.join(" "), 420);
}

function normalizeSynopsisGeneratedBeats(options: {
  beats: string[];
  summary: string;
  pov?: string;
}): string[] {
  const sourceBeats = options.beats
    .map((beat) => normalizeExtractionText(beat))
    .filter(Boolean);
  const seedBeats =
    sourceBeats.length > 0
      ? sourceBeats
      : buildRichBeatsFromText(options.summary);

  return sanitizeGeneratedSceneBeats(
    seedBeats.map((beat, index) => {
      if (!isStructurallyWeakGeneratedBeat(beat)) {
        return clampRichText(beat, 420);
      }

      return buildSynopsisDrivenBeat({
        beat,
        summary: options.summary,
        previousBeat: index > 0 ? seedBeats[index - 1] : undefined,
        nextBeat:
          index < seedBeats.length - 1 ? seedBeats[index + 1] : undefined,
        pov: options.pov,
      });
    }),
  );
}

function buildSynopsisDrivenChapterSummary(options: {
  chapterNumber: number;
  title: string;
  summary: string;
  beats: string[];
}): string {
  const summary = normalizeExtractionText(options.summary);
  if (!isWeakChapterSummary(summary)) {
    return clampRichText(summary, 520);
  }

  const anchor =
    splitIntoSentences(summary)[0] ||
    `${preferChapterTitle(options.title, `Chapter ${options.chapterNumber}`)} opens a new movement in the story`;
  const firstBeat = options.beats[0]
    ? stripTrailingSentencePunctuation(options.beats[0])
    : "";
  const lastBeat =
    options.beats.length > 1
      ? stripTrailingSentencePunctuation(
          options.beats[options.beats.length - 1],
        )
      : "";

  const sentences = [/[.!?]$/.test(anchor) ? anchor : `${anchor}.`];
  if (firstBeat) {
    sentences.push(
      `The chapter develops through ${lowercaseInitial(firstBeat)}.`,
    );
  }
  if (lastBeat && lastBeat !== firstBeat) {
    sentences.push(
      `By the end, pressure gathers around ${lowercaseInitial(lastBeat)}.`,
    );
  }

  return clampRichText(sentences.join(" "), 520);
}

function normalizeSuggestedChapterOutline(
  chapter: {
    chapterNumber: number;
    title: string;
    summary: string;
    beats: string[];
    suggestedPOV?: string;
    estimatedWords?: number;
    location?: string;
    timeframe?: string;
  },
  index: number,
): ChapterOutline {
  const chapterNumber = chapter.chapterNumber || index + 1;
  const title = chapter.title?.trim() || `Chapter ${chapterNumber}`;
  const rawSummary = chapter.summary?.trim() || "";
  const characters = chapter.suggestedPOV ? [chapter.suggestedPOV.trim()] : [];
  let beats = normalizeSynopsisGeneratedBeats({
    beats: Array.isArray(chapter.beats) ? chapter.beats : [],
    summary: rawSummary,
    pov: characters[0],
  });
  if (areWeakChapterBeats(beats)) {
    beats = normalizeSynopsisGeneratedBeats({
      beats: buildRichBeatsFromText(rawSummary || title),
      summary: rawSummary || title,
      pov: characters[0],
    });
  }

  return enrichChapterOutlineAnchors({
    chapterNumber,
    title,
    summary: buildSynopsisDrivenChapterSummary({
      chapterNumber,
      title,
      summary: rawSummary,
      beats,
    }),
    beats,
    characters,
    location: normalizeExtractionText(chapter.location || ""),
    timeframe: normalizeExtractionText(chapter.timeframe || ""),
  });
}

function buildRichBeatsFromText(
  text: string,
  minBeats = 3,
  maxBeats = 6,
): string[] {
  const sentences = splitIntoSentences(text);
  if (sentences.length === 0) {
    return [];
  }
  if (sentences.length <= 2) {
    return [sentences.join(" ")];
  }

  const targetBeatCount = Math.min(
    maxBeats,
    Math.max(minBeats, Math.ceil(sentences.length / 2)),
  );
  const groupSize = Math.max(1, Math.ceil(sentences.length / targetBeatCount));
  const beats: string[] = [];

  for (let index = 0; index < sentences.length; index += groupSize) {
    const beat = sentences
      .slice(index, index + groupSize)
      .join(" ")
      .trim();
    if (beat) {
      beats.push(clampRichText(beat, 420));
    }
  }

  const trimmedBeats = beats.slice(0, maxBeats);
  if (trimmedBeats.length > 1) {
    const lastBeat = trimmedBeats[trimmedBeats.length - 1];
    if (splitIntoSentences(lastBeat).length < 2) {
      trimmedBeats[trimmedBeats.length - 2] = clampRichText(
        `${trimmedBeats[trimmedBeats.length - 2]} ${lastBeat}`.trim(),
        420,
      );
      trimmedBeats.pop();
    }
  }

  return trimmedBeats;
}

function extractQuotedPhrases(text: string): string[] {
  return [...text.matchAll(/["“]([^"”]{2,120})["”]/g)]
    .map((match) => match[1].trim())
    .filter(Boolean);
}

function splitStructuredSections(
  text: string,
): Array<{ heading: string; content: string }> {
  const lines = normalizeStructuredSourceText(text).split("\n");
  const sections: Array<{ heading: string; content: string }> = [];
  let currentHeading = "";
  let buffer: string[] = [];

  const flush = (): void => {
    if (!currentHeading) {
      buffer = [];
      return;
    }
    sections.push({
      heading: currentHeading,
      content: normalizeExtractionText(buffer.join("\n")),
    });
    buffer = [];
  };

  const isHeadingLine = (line: string): boolean => {
    const trimmed = line.trim();
    if (!trimmed) return false;
    if (/^==\s*[^=].*[^=]\s*==$/.test(trimmed)) return true;
    if (/^(act|chapter)\s+[a-z0-9ivxlcdm]+\s*:/i.test(trimmed)) return true;
    if (STORY_BIBLE_REFERENCE_HEADINGS.has(normalizeHeadingLabel(trimmed)))
      return true;
    return (
      /^[A-Z0-9][A-Z0-9 '&/:-]{2,}$/.test(trimmed) &&
      trimmed === trimmed.toUpperCase()
    );
  };

  for (const line of lines) {
    if (isHeadingLine(line)) {
      flush();
      currentHeading = line.trim();
      continue;
    }
    buffer.push(line);
  }

  flush();
  return sections.filter((section) => section.heading);
}

function extractStructuredSectionContent(
  text: string,
  labels: string[],
): string {
  const normalizedLabels = new Set(
    labels.map((label) => normalizeHeadingLabel(label)),
  );
  for (const section of splitStructuredSections(text)) {
    if (normalizedLabels.has(normalizeHeadingLabel(section.heading))) {
      return section.content;
    }
  }

  const normalizedText = normalizeStructuredSourceText(text);
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = normalizedText.match(
      new RegExp(`(?:^|\\n)\\s*${escaped}\\s*:\\s*(.+)$`, "im"),
    );
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return "";
}

function normalizeCharacterRoleLabel(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (normalized.includes("protagonist")) return "protagonist";
  if (normalized.includes("antagonist")) return "antagonist";
  if (normalized.includes("support")) return "supporting";
  if (normalized.includes("minor")) return "minor";
  return "supporting";
}

function inferVocabularyLevel(text: string): Character["voice"]["vocabulary"] {
  const normalized = text.toLowerCase();
  if (/(simple|plain|direct|clinical|blunt|straightforward)/.test(normalized))
    return "simple";
  if (
    /(sophisticated|cultured|technical|mathematical|precise|formal|elegant|philosophical)/.test(
      normalized,
    )
  )
    return "sophisticated";
  return "moderate";
}

function splitInlineValues(text: string): string[] {
  return text
    .split(/[|,;/]/g)
    .flatMap((item) => item.split(/\band\b/gi))
    .map((item) => item.trim())
    .filter(Boolean);
}

function extractNicknameValues(text: string): string[] {
  return [...text.matchAll(/\b(?:Nicknames?|Other Names?)\s*:\s*([^\n]+)/gi)]
    .flatMap((match) => splitInlineValues(match[1]))
    .filter(Boolean);
}

function buildVoiceFromSection(text: string): Character["voice"] {
  const normalized = normalizeExtractionText(text);
  const sentences = splitIntoSentences(normalized);
  return {
    vocabulary: inferVocabularyLevel(normalized),
    speechPatterns: sentences
      .slice(0, 3)
      .map((sentence) => clampRichText(sentence, 140)),
    catchphrases: extractQuotedPhrases(normalized).slice(0, 5),
  };
}

function inferPrimaryMode(
  text: string,
): NonNullable<Character["cognitiveFilter"]>["primaryMode"] | undefined {
  const normalized = text.toLowerCase();
  if (!normalized) return undefined;
  if (
    /(calculate|precise|analytical|strategic|mathematic|logic|assessment)/.test(
      normalized,
    )
  )
    return "analytical";
  if (/(feels|grief|emotion|hurt|love|rage|fear|heart)/.test(normalized))
    return "emotional";
  if (/(instinct|gut|reflex|immediate|snap decision)/.test(normalized))
    return "instinctive";
  if (/(texture|light|temperature|smell|taste|sound|sensory)/.test(normalized))
    return "sensory";
  if (/(ritual|habit|pattern|ceremony|superstition)/.test(normalized))
    return "ritualistic";
  if (
    /(detached|observational|clinical|distance|disconnected)/.test(normalized)
  )
    return "detached";
  return undefined;
}

function isStructuredCharacterHeading(label: string): boolean {
  const withoutRole = label.replace(/\([^)]*\)/g, "").trim();
  const normalized = normalizeHeadingLabel(withoutRole);
  if (!normalized) {
    return false;
  }
  if (
    normalized.startsWith("the ") ||
    /(guild|district|headquarters|bazaar|company|g800|leviathan|technology|tokens|collection|philosophy|killing grounds|museum|room|vault|sanctum|quarter|exchange|center|transport)/.test(
      normalized,
    )
  ) {
    return false;
  }

  const words = withoutRole.split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.length > 5) {
    return false;
  }

  return words.every((word) => /^[A-Za-z'.-]+$/.test(word) || word === "&");
}

function isStructuredLocationHeading(label: string): boolean {
  const normalized = normalizeHeadingLabel(label);
  return (
    normalized.startsWith("the ") ||
    /(district|bazaar|headquarters|command|transport|killing grounds|museum|theatre|theater|vault|sanctum|yacht|g800|quarter|exchange|center|labyrinth|runway)/.test(
      normalized,
    )
  );
}

function parseStructuredChapterOutlines(
  text: string,
): StoryBible["chapterOutlines"] {
  const normalized = normalizeStructuredSourceText(text);
  const matches = [
    ...normalized.matchAll(
      /(?:^|\n)\s*Chapter\s+([A-Za-z0-9IVXLCDMivxlcdm]+)\s*:\s*([^\n:]+?)\s*:?\s*(?:\n+)?([\s\S]*?)(?=(?:\n\s*Chapter\s+[A-Za-z0-9IVXLCDMivxlcdm]+\s*:)|(?:\n\s*Act\s+[A-Za-z0-9IVXLCDMivxlcdm]+\s*:)|$)/g,
    ),
  ];

  const outlines: Array<ChapterOutline | null> = matches.map((match) => {
    const chapterNumber = parseOrdinalToken(match[1] || "");
    const title = (match[2] || "").trim();
    const body = normalizeExtractionText(match[3] || "");
    if (!chapterNumber || !title || !body) {
      return null;
    }
    return {
      chapterNumber,
      title,
      summary: clampRichText(body, 2000),
      beats: normalizeSynopsisGeneratedBeats({
        beats: buildRichBeatsFromText(body),
        summary: body,
      }),
      characters: [] as string[],
      location: "",
      timeframe: "",
    } satisfies ChapterOutline;
  });

  return outlines
    .filter((outline): outline is ChapterOutline => outline !== null)
    .sort((left, right) => left.chapterNumber - right.chapterNumber);
}

function parseStructuredActs(
  text: string,
  _chapterOutlines: StoryBible["chapterOutlines"],
): StoryBible["plotStructure"]["acts"] {
  const normalized = normalizeStructuredSourceText(text);
  const matches = [
    ...normalized.matchAll(
      /(?:^|\n)\s*Act\s+([A-Za-z0-9IVXLCDMivxlcdm]+)\s*:\s*([^\n]+?)\s*(?:\n+)?([\s\S]*?)(?=(?:\n\s*Act\s+[A-Za-z0-9IVXLCDMivxlcdm]+\s*:)|$)/g,
    ),
  ];

  return matches
    .map((match) => {
      const actNumber = parseOrdinalToken(match[1] || "");
      const actName = (match[2] || "").trim();
      const body = normalizeExtractionText(match[3] || "");
      if (!actNumber || !actName) {
        return null;
      }

      const chapterNumbers = [
        ...body.matchAll(
          /(?:^|\n)\s*Chapter\s+([A-Za-z0-9IVXLCDMivxlcdm]+)\s*:/g,
        ),
      ]
        .map((entry) => parseOrdinalToken(entry[1] || ""))
        .filter((value): value is number => Boolean(value));

      // Extract narrative events from the act body (not chapter titles)
      // Remove chapter references from body to avoid extracting chapter metadata as events
      const bodyWithoutChapterRefs = body.replace(
        /(?:^|\n)\s*Chapter\s+[A-Za-z0-9IVXLCDMivxlcdm]+\s*:[^\n]*$/gm,
        "",
      );

      return {
        number: actNumber,
        name: actName,
        description: clampRichText(body, 900),
        keyEvents: splitIntoSentences(bodyWithoutChapterRefs)
          .slice(0, 4)
          .map((sentence) => clampRichText(sentence, 180)),
        ...(chapterNumbers.length
          ? {
              chapterRange: {
                start: Math.min(...chapterNumbers),
                end: Math.max(...chapterNumbers),
              },
            }
          : {}),
      } satisfies StoryBible["plotStructure"]["acts"][number];
    })
    .filter((act): act is StoryBible["plotStructure"]["acts"][number] =>
      Boolean(act),
    )
    .sort((left, right) => left.number - right.number);
}

function parseStructuredCharacterDossiers(text: string): Character[] {
  const normalized = normalizeStructuredSourceText(text);
  const matches = [...normalized.matchAll(/^==\s*(.+?)\s*==$/gm)];
  const characters: Character[] = [];

  for (let index = 0; index < matches.length; index += 1) {
    const current = matches[index];
    const rawHeading = (current[1] || "").trim();
    if (!isStructuredCharacterHeading(rawHeading)) {
      continue;
    }

    const nextIndex = matches[index + 1]?.index ?? normalized.length;
    const block = normalized
      .slice((current.index ?? 0) + current[0].length, nextIndex)
      .trim();
    if (!block) {
      continue;
    }

    const headingMatch = rawHeading.match(/^(.*?)\s*(?:\(([^)]+)\))?$/);
    const name = headingMatch?.[1]?.trim() || rawHeading;
    const role = normalizeCharacterRoleLabel(headingMatch?.[2] || "");

    const sectionMap = new Map<string, string>();
    for (const section of splitStructuredSections(block)) {
      const key = normalizeHeadingLabel(section.heading);
      if (!key) continue;
      const previous = sectionMap.get(key);
      sectionMap.set(
        key,
        previous ? `${previous}\n\n${section.content}` : section.content,
      );
    }

    const who =
      sectionMap.get("who she is") ||
      sectionMap.get("who he is") ||
      sectionMap.get("who they is") ||
      "";
    const personality = sectionMap.get("personality") || "";
    const background = sectionMap.get("background") || "";
    const physicalPresence = sectionMap.get("physical presence") || "";
    const voiceSection = sectionMap.get("voice and speech") || "";
    const internalTension =
      sectionMap.get("internal tension") ||
      [...sectionMap.entries()].find(([heading]) =>
        heading.includes("flaw"),
      )?.[1] ||
      "";
    const evolutionArc = sectionMap.get("evolution arc") || "";
    const capabilities = sectionMap.get("capabilities") || "";
    const combinedText = [
      who,
      personality,
      background,
      physicalPresence,
      voiceSection,
      internalTension,
      evolutionArc,
      capabilities,
    ]
      .filter(Boolean)
      .join("\n\n");

    const relationships = [...sectionMap.entries()]
      .map(([heading, content]) => {
        const relationshipMatch = heading.match(
          /^(relationship|rivalry) with (.+)$/,
        );
        if (!relationshipMatch) {
          return null;
        }
        return {
          characterName: relationshipMatch[2]
            .split(/\s+/)
            .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
            .join(" "),
          type: relationshipMatch[1] === "rivalry" ? "rival" : "relationship",
          description: clampRichText(content, 500),
        };
      })
      .filter(
        (
          value,
        ): value is {
          characterName: string;
          type: string;
          description: string;
        } => value !== null,
      );

    const inferredMode = inferPrimaryMode(
      `${who} ${personality} ${voiceSection} ${internalTension}`,
    );
    const signatureThoughts = extractQuotedPhrases(
      `${voiceSection}\n${internalTension}`,
    ).slice(0, 3);

    const character = normalizeCharacterPayload({
      name,
      nicknames: extractNicknameValues(combinedText),
      role,
      description: clampRichText(
        [who, personality, physicalPresence, capabilities]
          .filter(Boolean)
          .join(" "),
        1600,
      ),
      backstory: clampRichText(background, 1000),
      motivation: "",
      fears: [],
      flaw: clampRichText(internalTension, 700),
      arc: clampRichText(evolutionArc, 900),
      voice: buildVoiceFromSection(voiceSection || personality || who),
      relationships: relationships as unknown as Character["relationships"],
      ...(inferredMode || internalTension || voiceSection
        ? {
            cognitiveFilter: {
              primaryMode: inferredMode || "analytical",
              internalLanguage: clampRichText(
                voiceSection || who || personality,
                180,
              ),
              blindSpot: clampRichText(internalTension, 220),
              repeatingThoughtLoop: signatureThoughts[0] || "",
              forbiddenWords: [],
              signatureThoughts,
            },
          }
        : {}),
    });

    if (
      character.name &&
      (character.description ||
        character.backstory ||
        character.arc ||
        character.relationships.length)
    ) {
      characters.push(character);
    }
  }

  return characters;
}

function extractFirstJsonObject(text: string): string | null {
  const source = text.trim();
  const start = source.indexOf("{");
  if (start < 0) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) {
      continue;
    }
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }

  return null;
}

function parseStoryBibleJsonSeed(text: string): StoryBible | null {
  const jsonBlock = extractFirstJsonObject(normalizeStructuredSourceText(text));
  if (!jsonBlock) {
    return null;
  }

  try {
    const parsed = JSON.parse(jsonBlock) as Partial<StoryBible>;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    if (
      !("premise" in parsed) &&
      !("characters" in parsed) &&
      !("world" in parsed) &&
      !("plotStructure" in parsed)
    ) {
      return null;
    }
    return normalizeStoryBiblePayload(parsed);
  } catch {
    return null;
  }
}

function looksLikeLabeledCharacterDossiers(text: string): boolean {
  const normalized = normalizeStructuredSourceText(text);
  if (!normalized) {
    return false;
  }

  const nameCount = (normalized.match(/(?:^|\n)\s*NAME\s*:/gi) || []).length;
  const personalityCount = (
    normalized.match(/(?:^|\n)\s*PERSONALITY\s*:/gi) || []
  ).length;
  const backgroundCount = (
    normalized.match(/(?:^|\n)\s*BACKGROUND\s*:/gi) || []
  ).length;
  const dialogueCount = (
    normalized.match(/(?:^|\n)\s*DIALOGUE STYLE\s*:/gi) || []
  ).length;

  return (
    nameCount >= 1 &&
    personalityCount >= 1 &&
    (backgroundCount >= 1 || dialogueCount >= 1)
  );
}

function parseLabeledFieldMap(text: string): Map<string, string> {
  const lines = normalizeStructuredSourceText(text).split("\n");
  const fieldMap = new Map<string, string>();
  let currentField = "";
  let buffer: string[] = [];

  const flush = (): void => {
    if (!currentField) {
      buffer = [];
      return;
    }
    const content = normalizeExtractionText(buffer.join("\n"));
    if (content) {
      const previous = fieldMap.get(currentField);
      fieldMap.set(
        currentField,
        previous ? `${previous}\n\n${content}` : content,
      );
    }
    currentField = "";
    buffer = [];
  };

  for (const line of lines) {
    const match = line.match(/^\s*([A-Z][A-Z0-9 '&/.()'-]{2,}?)\s*:\s*(.*)$/);
    normalizeHeadingLabel(match?.[1] || "");
  }

  flush();
  return fieldMap;
}

function inferMotivationFromText(text: string): string {
  const normalized = normalizeExtractionText(text);
  if (!normalized) {
    return "";
  }

  const patterns = [
    /\bdriven by ([^.]+)/i,
    /\bdriven to ([^.]+)/i,
    /\bseeks? to ([^.]+)/i,
    /\baims? to ([^.]+)/i,
    /\bdetermined to ([^.]+)/i,
    /\bvowed to ([^.]+)/i,
    /\bcommitted to ([^.]+)/i,
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match?.[0]) {
      return clampRichText(match[0], 320);
    }
  }

  const sentence = splitIntoSentences(normalized).find((entry) =>
    /\bdriven|seeks?|aims?|determined|committed|vowed|pursuit\b/i.test(entry),
  );
  return sentence ? clampRichText(sentence, 320) : "";
}

function inferFearsFromText(text: string): string[] {
  const normalized = normalizeExtractionText(text);
  if (!normalized) {
    return [];
  }

  const fears = [
    ...normalized.matchAll(
      /\b(?:fear|fears|afraid of|terrified of|dreads?|worries about)\s+([^.;]+)/gi,
    ),
  ]
    .map((match) => clampRichText(match[1] || "", 180))
    .filter(Boolean);

  return mergeUniqueStrings(fears).slice(0, 5);
}

function inferFlawFromText(text: string): string {
  const candidates = splitIntoSentences(text);
  const match =
    candidates.find((sentence) =>
      /\bflaw|weakness|however|but\b|obsession|compulsive|inability|too\s+\w+/i.test(
        sentence,
      ),
    ) ||
    candidates.find((sentence) =>
      /\bcontrol|distance|aloof|chaos|precision|dangerous|ruthless/i.test(
        sentence,
      ),
    ) ||
    "";
  return clampRichText(match, 360);
}

function inferRepeatingThoughtLoop(text: string): string {
  const quoted = extractQuotedPhrases(text)[0];
  if (quoted) {
    return clampRichText(quoted, 160);
  }

  const sentence =
    splitIntoSentences(text).find((entry) =>
      /\bjustice|control|survive|protect|balance|power|order|truth|mission\b/i.test(
        entry,
      ),
    ) || "";
  return clampRichText(sentence, 160);
}

function isLikelyNonCharacterDossier(
  name: string,
  fields: Map<string, string>,
): boolean {
  const combined =
    `${name}\n${Array.from(fields.values()).join("\n")}`.toLowerCase();
  const pronouns = (fields.get("pronouns") || "").toLowerCase();

  if (!name.trim()) {
    return true;
  }
  if (/\d{3,}/.test(name)) {
    return true;
  }
  if (/\b(car|automobile|roadster|vehicle)\b/.test(pronouns)) {
    return true;
  }

  return /\b(bentley|coupe|sedan|engine|horsepower|transmission|driveline|city \/ highway|mpg)\b/i.test(
    combined,
  );
}

function parseLabeledCharacterDossiers(text: string): Character[] {
  const normalized = normalizeStructuredSourceText(text);
  const blocks = [
    ...normalized.matchAll(
      /(?:^|\n)\s*NAME\s*:\s*([^\n]+)\s*([\s\S]*?)(?=(?:\n\s*NAME\s*:)|$)/gi,
    ),
  ];
  const characters: Character[] = [];

  for (const block of blocks) {
    const blockText =
      `NAME: ${(block[1] || "").trim()}\n${(block[2] || "").trim()}`.trim();
    const fields = parseLabeledFieldMap(blockText);
    const name = asString(fields.get("name")) || asString(block[1]);
    if (isLikelyNonCharacterDossier(name, fields)) {
      continue;
    }

    const personality = fields.get("personality") || "";
    const background = fields.get("background") || "";
    const physicalDescription =
      fields.get("physical description") ||
      fields.get("physical presence") ||
      "";
    const dialogueStyle =
      fields.get("dialogue style") || fields.get("voice and speech") || "";
    const summary = fields.get("sum total") || "";
    const criticalLoss = fields.get("the critical loss") || "";
    const secretOrigin = fields.get("the secret origin") || "";
    const craziness = fields.get("craziness") || "";
    const phrases = [
      fields.get("coco's energy diet") || "",
      fields.get("optimization manifesto") || "",
      fields.get("phrases") || "",
    ]
      .filter(Boolean)
      .join("\n\n");
    const candidate = normalizeCharacterPayload({
      name,
      nicknames: mergeUniqueStrings(
        asStringArray(splitInlineValues(fields.get("other names") || "")),
        extractNicknameValues(blockText),
      ),
      role: normalizeCharacterRoleLabel(fields.get("roles") || ""),
      description: clampRichText(
        [summary, personality, physicalDescription].filter(Boolean).join(" "),
        1800,
      ),
      backstory: clampRichText(
        [background, criticalLoss, secretOrigin].filter(Boolean).join("\n\n"),
        1400,
      ),
      motivation: inferMotivationFromText(
        [summary, background, criticalLoss].filter(Boolean).join(" "),
      ),
      fears: inferFearsFromText(
        [personality, background, summary, criticalLoss]
          .filter(Boolean)
          .join(" "),
      ),
      flaw: clampRichText(
        craziness ||
          inferFlawFromText(
            [personality, summary, background].filter(Boolean).join(" "),
          ),
        500,
      ),
      arc: clampRichText(summary, 1000),
      voice: {
        vocabulary: inferVocabularyLevel(
          [dialogueStyle, personality].filter(Boolean).join(" "),
        ),
        speechPatterns: splitIntoSentences(dialogueStyle || personality)
          .slice(0, 3)
          .map((sentence) => clampRichText(sentence, 160)),
        catchphrases: mergeUniqueStrings(
          extractQuotedPhrases(dialogueStyle),
          extractQuotedPhrases(phrases),
        ).slice(0, 6),
      },
      relationships: [],
      cognitiveFilter: {
        primaryMode:
          inferPrimaryMode(
            [personality, background, summary, criticalLoss].join(" "),
          ) || "analytical",
        internalLanguage: clampRichText(
          dialogueStyle || personality || summary,
          220,
        ),
        blindSpot: clampRichText(
          craziness || inferFlawFromText([personality, summary].join(" ")),
          220,
        ),
        repeatingThoughtLoop: inferRepeatingThoughtLoop(
          [phrases, summary, personality].filter(Boolean).join(" "),
        ),
        forbiddenWords: [],
        signatureThoughts: mergeUniqueStrings(
          extractQuotedPhrases(dialogueStyle),
          extractQuotedPhrases(phrases),
        ).slice(0, 3),
      },
    });

    if (
      !(
        candidate.description ||
        candidate.backstory ||
        candidate.motivation ||
        candidate.arc
      )
    ) {
      continue;
    }

    const existing = findExistingCharacter(characters, candidate.name);
    if (!existing) {
      characters.push(candidate);
      continue;
    }

    const existingIndex = characters.findIndex(
      (item) => item.id === existing.id,
    );
    characters[existingIndex] = normalizeCharacterPayload(
      enrichCharacter(existing, candidate),
    );
  }

  return characters;
}

function parseDossierStoryBibleSeed(text: string): StoryBible | null {
  if (!looksLikeLabeledCharacterDossiers(text)) {
    return null;
  }

  const normalized = normalizeStructuredSourceText(text);
  const prefaceEnd = normalized.search(/(?:^|\n)\s*NAME\s*:/i);
  const prefaceText = (
    prefaceEnd >= 0 ? normalized.slice(0, prefaceEnd).trim() : normalized
  )
    .replace(/(?:^|\n)\s*Reference Notes\s*(?=\n|$)/gi, "\n")
    .replace(/(?:^|\n)\s*Chapter\s+\d+\s*:\s*[^\n]+/gi, "\n")
    .trim();
  const chapterOutlines = parseStructuredChapterOutlines(normalized);
  const acts = parseStructuredActs(normalized, chapterOutlines);
  const characters = parseLabeledCharacterDossiers(normalized);
  const synopsis = clampRichText(prefaceText, 2400);
  const logline = clampRichText(
    splitIntoSentences(prefaceText).slice(0, 2).join(" "),
    320,
  );

  return normalizeStoryBiblePayload({
    premise: {
      logline,
      synopsis,
      themes: [],
      tone: "",
      genre: "",
    },
    characters,
    world: {
      setting: clampRichText(prefaceText, 1400),
      timePeriod: "",
      locations: [],
      rules: [],
    },
    plotStructure: {
      acts,
      plotThreads: [],
    },
    chapterOutlines,
    styleDirectives: {
      pov: "",
      tense: "",
      proseStyle: "",
      dialogueStyle: "",
    },
  });
}

function parseStructuredLocations(
  text: string,
): StoryBible["world"]["locations"] {
  const normalized = normalizeStructuredSourceText(text);
  const matches = [...normalized.matchAll(/^==\s*(.+?)\s*==$/gm)];

  return matches
    .map((match, index) => {
      const heading = (match[1] || "").trim();
      if (
        !isStructuredLocationHeading(heading) ||
        isStructuredCharacterHeading(heading)
      ) {
        return null;
      }
      const nextIndex = matches[index + 1]?.index ?? normalized.length;
      const block = normalized
        .slice((match.index ?? 0) + match[0].length, nextIndex)
        .trim();
      if (!block) {
        return null;
      }
      return {
        name: heading.replace(/\([^)]*\)/g, "").trim(),
        description: clampRichText(block, 1200),
        significance: splitIntoSentences(block)[0] || "",
      };
    })
    .filter((location): location is StoryBible["world"]["locations"][number] =>
      Boolean(location),
    );
}

function parseThemes(text: string): string[] {
  const normalized = normalizeExtractionText(text);
  if (!normalized) {
    return [];
  }
  return normalized
    .split(/\s+-\s+|[;\n]+/g)
    .map((item) => item.trim().replace(/^[-*]\s*/, ""))
    .filter((item) => item.length > 2 && item.length <= 120)
    .slice(0, 10);
}

function looksLikeStructuredStoryBible(text: string): boolean {
  const normalized = normalizeStructuredSourceText(text);
  if (!normalized) {
    return false;
  }

  if (looksLikeLabeledCharacterDossiers(normalized)) {
    return true;
  }

  let score = 0;
  if (/story bible/i.test(normalized.slice(0, 500))) score += 1;
  if (/(?:^|\n)\s*chapter\s+[a-z0-9ivxlcdm]+\s*:/i.test(normalized)) score += 1;
  if (/(?:^|\n)\s*act\s+[a-z0-9ivxlcdm]+\s*:/i.test(normalized)) score += 1;
  if (/^==\s*[^=].*[^=]\s*==$/im.test(normalized)) score += 1;
  if (
    splitStructuredSections(normalized).filter((section) =>
      STORY_BIBLE_REFERENCE_HEADINGS.has(
        normalizeHeadingLabel(section.heading),
      ),
    ).length >= 3
  )
    score += 1;
  return score >= 2;
}

function attachCharactersToChapterOutlines(
  chapterOutlines: StoryBible["chapterOutlines"],
  characters: Character[],
): StoryBible["chapterOutlines"] {
  return chapterOutlines.map((outline) => {
    if (outline.characters.length) {
      return outline;
    }

    const haystack = `${outline.title}\n${outline.summary}\n${outline.beats.join("\n")}`;
    const matchedCharacters = characters
      .filter((character) => {
        const aliases = [character.name, ...(character.nicknames || [])].filter(
          Boolean,
        );
        return aliases.some((alias) => {
          const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          return new RegExp(`\\b${escaped}\\b`, "i").test(haystack);
        });
      })
      .map((character) => character.name);

    return matchedCharacters.length
      ? { ...outline, characters: matchedCharacters }
      : outline;
  });
}

function synchronizeChapterOutlineCharacters(
  chapterOutlines: StoryBible["chapterOutlines"],
  characters: Character[],
): StoryBible["chapterOutlines"] {
  return chapterOutlines.map((outline) => {
    const knownCharacters = canonicalizeCharacterReferences(
      outline.characters,
      characters,
    ).filter((name) => Boolean(findExistingCharacter(characters, name)));

    return knownCharacters.length === outline.characters.length &&
      knownCharacters.every((name, index) => name === outline.characters[index])
      ? outline
      : { ...outline, characters: knownCharacters };
  });
}

function parseStructuredStoryBibleSeed(text: string): StoryBible | null {
  const jsonSeed = parseStoryBibleJsonSeed(text);
  if (jsonSeed) {
    return jsonSeed;
  }

  const dossierSeed = parseDossierStoryBibleSeed(text);
  if (dossierSeed) {
    return dossierSeed;
  }

  if (!looksLikeStructuredStoryBible(text)) {
    return null;
  }

  const normalized = normalizeStructuredSourceText(text);
  const chapterOutlines = parseStructuredChapterOutlines(normalized);
  const characters = parseStructuredCharacterDossiers(normalized);
  const acts = parseStructuredActs(normalized, chapterOutlines);
  const locations = parseStructuredLocations(normalized);
  const logline = extractStructuredSectionContent(normalized, ["logline"]);
  const themesText = extractStructuredSectionContent(normalized, ["themes"]);
  const settingText = extractStructuredSectionContent(normalized, [
    "era and setting",
    "setting",
  ]);
  const dialogueStyle = extractStructuredSectionContent(normalized, [
    "on dialogue",
  ]);
  const proseStyle = [
    extractStructuredSectionContent(normalized, ["on environment"]),
    extractStructuredSectionContent(normalized, ["on violence"]),
    extractStructuredSectionContent(normalized, ["on tone"]),
    extractStructuredSectionContent(normalized, ["on wealth"]),
  ]
    .filter(Boolean)
    .join("\n\n");
  const synopsis = chapterOutlines
    .slice(0, 3)
    .map((outline) => outline.summary)
    .filter(Boolean)
    .join(" ");
  const worldRules = [
    [
      "The Role of Fashion",
      extractStructuredSectionContent(normalized, ["the role of fashion"]),
    ],
    [
      "Power Structures",
      extractStructuredSectionContent(normalized, ["power structures"]),
    ],
    [
      "Technology and World Details",
      extractStructuredSectionContent(normalized, [
        "technology and world details",
      ]),
    ],
  ]
    .filter(([, content]) => Boolean(content))
    .map(([label, content]) => `${label}: ${clampRichText(content, 280)}`);

  return normalizeStoryBiblePayload({
    premise: {
      logline,
      synopsis,
      themes: parseThemes(themesText),
      tone: splitIntoSentences(themesText)[0] || "",
      genre: splitIntoSentences(settingText)[0] || "",
    },
    characters,
    world: {
      setting: clampRichText(settingText, 1600),
      timePeriod: "",
      locations,
      rules: worldRules,
    },
    plotStructure: {
      acts,
      plotThreads: [],
    },
    chapterOutlines,
    styleDirectives: {
      pov: "",
      tense: "",
      proseStyle: clampRichText(proseStyle, 1500),
      dialogueStyle: clampRichText(dialogueStyle, 900),
    },
  });
}

function buildProjectExtractionSource(
  project: Project,
  explicitText?: string,
): string {
  const supplied = normalizeExtractionText(explicitText || "");
  if (supplied) {
    return supplied;
  }

  const concreteChapters = getOrderedProjectChapters(project).filter(
    (chapter) => normalizeExtractionText(chapter.content || "").length > 0,
  );
  if (concreteChapters.length > 1) {
    return concreteChapters
      .map((chapter) => {
        const split = splitNarrativeAndReferenceText(chapter.content || "");
        const chapterText = split.narrativeText || split.fullText;
        if (!chapterText) return "";
        return `=== Chapter ${chapter.chapterNumber}: ${chapter.title || `Chapter ${chapter.chapterNumber}`} ===\n\n${chapterText}`;
      })
      .filter(Boolean)
      .join("\n\n");
  }

  const baseText = concreteChapters[0]?.content || project.content || "";
  const split = splitNarrativeAndReferenceText(baseText);

  if (split.narrativeText && split.referenceText) {
    return [
      `=== Chapter 1: ${concreteChapters[0]?.title || "Chapter 1"} ===`,
      split.narrativeText,
      "=== Reference Notes ===",
      split.referenceText,
    ].join("\n\n");
  }

  const inferred = buildInferredExtractionChapters(split.fullText);
  if (inferred.length > 1) {
    return inferred
      .map(
        (chapter) =>
          `=== Chapter ${chapter.chapterNumber}: ${chapter.title || `Chapter ${chapter.chapterNumber}`} ===\n\n${chapter.content}`,
      )
      .join("\n\n");
  }

  return split.fullText;
}

function isLowSignalCharacter(character: Character): boolean {
  const textSignal = [
    character.description,
    character.backstory,
    character.motivation,
    character.flaw,
    character.arc,
  ]
    .join(" ")
    .trim().length;
  const listSignal =
    (character.nicknames?.length || 0) +
    (character.fears?.length || 0) +
    (character.relationships?.length || 0) +
    (character.voice?.speechPatterns?.length || 0) +
    (character.voice?.catchphrases?.length || 0) +
    (character.cognitiveFilter ? 2 : 0);

  return (
    textSignal < 120 &&
    listSignal < 3 &&
    (character.role || "").trim().toLowerCase() === "minor"
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeCharacterSupportText(text: string): string {
  return normalizeExtractionText(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildCharacterNameSupportVariants(name: string): string[] {
  const normalized = normalizeCharacterName(name);
  if (!normalized) {
    return [];
  }

  const tokens = normalized.split(" ").filter(Boolean);
  const variants = new Set([normalized]);

  const withDigits = tokens
    .map((token) => {
      const asNumber = ORDINAL_NUMBER_WORDS.get(token);
      return typeof asNumber === "number" ? String(asNumber) : token;
    })
    .join(" ");
  if (withDigits) {
    variants.add(withDigits);
  }

  const withWords = tokens
    .map((token) => {
      if (!/^\d+$/.test(token)) {
        return token;
      }
      return NUMBER_WORD_BY_VALUE.get(Number(token)) || token;
    })
    .join(" ");
  if (withWords) {
    variants.add(withWords);
  }

  return Array.from(variants);
}

function sourceSupportsCharacterLabel(
  normalizedSourceText: string,
  characterName: string,
): boolean {
  if (!normalizedSourceText) {
    return false;
  }

  return buildCharacterNameSupportVariants(characterName).some((variant) =>
    new RegExp(`(?:^|\\s)${escapeRegExp(variant)}(?:$|\\s)`).test(
      normalizedSourceText,
    ),
  );
}

function isGenericCharacterLabel(name: string): boolean {
  const normalized = normalizeCharacterName(name);
  if (!normalized) {
    return false;
  }

  const tokens = normalized.split(" ").filter(Boolean);
  if (tokens.length < 2) {
    return false;
  }

  const hasRoleToken = tokens.some((token) =>
    GENERIC_CHARACTER_ROLE_TOKENS.has(token),
  );
  if (!hasRoleToken) {
    return false;
  }

  if (
    tokens.some(
      (token) => /^\d+$/.test(token) || ORDINAL_NUMBER_WORDS.has(token),
    )
  ) {
    return true;
  }

  const finalToken = tokens[tokens.length - 1];
  const leadingTokens = tokens.slice(0, -1);
  if (
    GENERIC_CHARACTER_ROLE_TOKENS.has(finalToken) &&
    leadingTokens.every(
      (token) =>
        GENERIC_CHARACTER_DESCRIPTOR_TOKENS.has(token) ||
        GENERIC_CHARACTER_ROLE_TOKENS.has(token),
    )
  ) {
    return true;
  }

  return tokens.every(
    (token) =>
      GENERIC_CHARACTER_DESCRIPTOR_TOKENS.has(token) ||
      GENERIC_CHARACTER_ROLE_TOKENS.has(token),
  );
}

function repairCharacterRoster(
  characters: Character[],
  sourceText: string,
  logger?: {
    info(message: string, data?: unknown): void;
  },
): Character[] {
  const normalizedSourceText = normalizeCharacterSupportText(sourceText || "");
  const normalizedCharacters = characters.map((character) =>
    normalizeCharacterPayload(character),
  );
  if (!normalizedSourceText) {
    return normalizedCharacters;
  }

  const pruned: string[] = [];
  const repaired = normalizedCharacters.filter((character) => {
    if (
      isLowSignalCharacter(character) &&
      isGenericCharacterLabel(character.name) &&
      !sourceSupportsCharacterLabel(normalizedSourceText, character.name)
    ) {
      pruned.push(character.name);
      return false;
    }

    return true;
  });

  if (pruned.length) {
    logger?.info("Pruned stale low-signal generic characters", {
      count: pruned.length,
      names: pruned,
    });
  }

  return repaired;
}

function extractJsonParseErrorPosition(error: unknown): number | null {
  const message = error instanceof Error ? error.message : String(error);
  const match = message.match(/position\s+(\d+)/i);
  return match ? parseInt(match[1], 10) : null;
}

function buildJsonErrorContext(
  text: string,
  position: number | null,
  radius: number = 180,
): string {
  if (position === null || position < 0) {
    return text.slice(0, radius * 2);
  }

  const start = Math.max(0, position - radius);
  const end = Math.min(text.length, position + radius);
  return text.slice(start, end);
}

export function registerStoryBibleRoutes(
  app: Express,
  deps: StoryBibleRouteDeps,
): void {
  const storyBibleOptions = (
    maxTokens: number,
  ): {
    maxTokens: number;
    model?: string;
    provider?: ProviderConfig;
  } => {
    const model = deps.getStoryBibleModel();
    const provider = deps.getStoryBibleProvider(model);
    return {
      maxTokens,
      ...(model ? { model } : {}),
      ...(provider ? { provider } : {}),
    };
  };

  const runStoryBibleCompletion = async (
    systemPrompt: string,
    userMessage: string,
    maxTokens: number,
  ): Promise<{ text: string; tokens: number }> => {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      STORY_BIBLE_REQUEST_TIMEOUT_MS,
    );

    try {
      return await deps.chatCompletion(systemPrompt, userMessage, {
        ...storyBibleOptions(maxTokens),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  };

  const runCharacterExtraction = async ({
    sourceText,
    existingCharacters,
    enrichExisting,
    logger,
  }: {
    sourceText: string;
    existingCharacters: Character[];
    enrichExisting: boolean;
    logger: {
      info(message: string, data?: unknown): void;
      warn(message: string, data?: unknown): void;
    };
  }): Promise<{
    characters: Character[];
    extractionMetrics: CharacterExtractionMetrics;
  }> => {
    const extractedCharacters = existingCharacters.map((character) =>
      normalizeCharacterPayload(character),
    );
    const extractionMetrics = buildEmptyCharacterExtractionMetrics();
    const analysisText = buildRepresentativeExcerpt(
      sourceText,
      STORY_BIBLE_CHARACTER_SAMPLE_CHARS,
    );

    for (
      let passIndex = 0;
      passIndex < CHARACTER_EXTRACTION_PASSES.length;
      passIndex += 1
    ) {
      const pass = CHARACTER_EXTRACTION_PASSES[passIndex];
      logger.info(`Running pass ${passIndex + 1}: ${pass.name}`);

      let responseText = "";
      try {
        ({ text: responseText } = await runStoryBibleCompletion(
          "You are a thorough story analyst extracting characters. Preserve rich character dossiers and respond only with valid JSON.",
          `${pass.prompt}

Return a JSON array of characters.
- Extract every named character that matches this pass, including characters with explicit dossier headings.
- Do NOT collapse rich source material into generic summaries.
- Do NOT skip named characters if the source clearly identifies them.
- If the source contains structured character dossiers or story-bible sections, preserve that detail instead of flattening it.
- Fill cognitiveFilter when the source supports it.
- Prefer detailed, concrete fields over generic adjectives.
- If nothing matches, return [].

[
  {
    "name": "character name",
    "nicknames": ["alternate names or titles used in text"],
    "role": "protagonist/antagonist/supporting/minor",
    "description": "physical and personality description",
    "backstory": "relevant backstory if known",
    "motivation": "what drives them",
    "fears": ["fear1"],
    "flaw": "main flaw",
    "arc": "character arc description if apparent",
    "voice": {
      "vocabulary": "simple/moderate/sophisticated",
      "speechPatterns": ["pattern1"],
      "catchphrases": []
    },
    "cognitiveFilter": {
      "primaryMode": "analytical/emotional/instinctive/ritualistic/detached/sensory",
      "internalLanguage": "how this character thinks",
      "blindSpot": "what they cannot see about themselves",
      "repeatingThoughtLoop": "their recurring internal question or mantra",
      "forbiddenWords": ["word"],
      "signatureThoughts": ["phrase"]
    },
    "relationships": [{"characterName": "other character", "type": "spouse/friend/enemy/etc", "description": "relationship details"}]
  }
]

TEXT TO ANALYZE:
${analysisText}

Return ONLY a JSON array of characters.`,
          Math.min(6000, deps.tokenLimits.STORY_BIBLE_EXTRACT.output),
        ));
      } catch (error) {
        logger.warn(`Pass ${passIndex + 1} request failed`, {
          error: String(error),
        });
        extractionMetrics.passBreakdown.push({
          pass: passIndex + 1,
          name: pass.name,
          found: 0,
          newAdded: 0,
          duplicatesSkipped: 0,
          enriched: 0,
        });
        continue;
      }

      let passCharacters: Partial<Character>[] = [];
      try {
        passCharacters = JSON.parse(deps.extractJSON(responseText));
        if (!Array.isArray(passCharacters)) {
          passCharacters = [];
        }
      } catch {
        logger.warn(`Pass ${passIndex + 1} returned invalid JSON`, {
          responsePreview: responseText.slice(0, 400),
        });
        passCharacters = [];
      }

      const passMetrics: CharacterPassMetrics = {
        pass: passIndex + 1,
        name: pass.name,
        found: passCharacters.length,
        newAdded: 0,
        duplicatesSkipped: 0,
        enriched: 0,
      };

      for (const character of passCharacters) {
        const normalizedCharacter = normalizeCharacterPayload(character);
        if (
          !normalizedCharacter.name ||
          normalizedCharacter.name === "Unknown Character"
        ) {
          continue;
        }

        const existing = findExistingCharacter(
          extractedCharacters,
          normalizedCharacter.name,
        );
        if (existing) {
          if (enrichExisting) {
            const enriched = normalizeCharacterPayload(
              enrichCharacter(existing, normalizedCharacter),
            );
            const characterIndex = extractedCharacters.findIndex(
              (item) => item.id === existing.id,
            );
            extractedCharacters[characterIndex] = enriched;
            passMetrics.enriched += 1;
          } else {
            passMetrics.duplicatesSkipped += 1;
          }
          continue;
        }

        extractedCharacters.push(normalizedCharacter);
        passMetrics.newAdded += 1;
      }

      extractionMetrics.passBreakdown.push(passMetrics);
      extractionMetrics.totalCharactersFound += passMetrics.found;
      extractionMetrics.totalNewAdded += passMetrics.newAdded;
      extractionMetrics.totalDuplicatesSkipped += passMetrics.duplicatesSkipped;
      extractionMetrics.totalEnriched += passMetrics.enriched;

      logger.info(`Pass ${passIndex + 1} complete`, passMetrics);
    }

    return { characters: extractedCharacters, extractionMetrics };
  };

  const extractChapterOutlines = async (
    project: Project,
    storyBible: StoryBible,
    sourceLogger = deps.logger,
    explicitText?: string,
    allowFallbackOutlines = false,
  ): Promise<StoryBible["chapterOutlines"]> => {
    const explicitSource = buildProjectExtractionSource(project, explicitText);
    const structuredSeed = parseStructuredStoryBibleSeed(explicitSource);
    if (structuredSeed?.chapterOutlines.length) {
      return structuredSeed.chapterOutlines;
    }

    const orderedChapters = getOutlineExtractionChapters(
      project,
      explicitText,
    ).filter(
      (chapter: OrderedChapter) =>
        normalizeExtractionText(chapter.content || "").length >= 50,
    );

    // If only synthetic chapter but acts exist, create chapters from acts instead
    if (
      orderedChapters.length === 1 &&
      orderedChapters[0]?.id.startsWith("synthetic-") &&
      storyBible.plotStructure.acts.length > 0
    ) {
      sourceLogger.info(
        "Only synthetic chapter found; creating enriched chapters from acts",
        {
          projectId: project.id,
          actsCount: storyBible.plotStructure.acts.length,
        },
      );

      const chapters: ChapterOutline[] = [];
      let chapterNum = 1;

      // Get the full content from the synthetic chapter for beat extraction
      const fullContent = orderedChapters[0]?.content || "";

      for (const act of storyBible.plotStructure.acts) {
        const chapterCount = act.chapterRange
          ? act.chapterRange.end - act.chapterRange.start + 1
          : 2;

        // Get relevant plot threads for this act
        const actStart = act.chapterRange?.start || 1;
        const actEnd = act.chapterRange?.end || actStart + chapterCount - 1;
        const relevantThreads = storyBible.plotStructure.plotThreads.filter(
          (thread) =>
            (thread.introducedIn === undefined ||
              thread.introducedIn <= actEnd) &&
            (thread.resolvedIn === null ||
              thread.resolvedIn === undefined ||
              thread.resolvedIn >= actStart),
        );
        const actCharacters = Array.from(
          new Set(relevantThreads.flatMap((t) => t.keyCharacters || [])),
        ).slice(0, 5);

        for (let i = 0; i < chapterCount; i++) {
          const chapNum = actStart + i;
          const threadStatus = relevantThreads
            .map((t) => {
              if (t.introducedIn === chapNum) return `${t.name} begins`;
              if (t.resolvedIn === chapNum) return `${t.name} resolves`;
              return null;
            })
            .filter((status): status is string => Boolean(status));

          // Use AI to extract proper narrative beats from the full content
          let beats: string[] = [];

          if (fullContent && fullContent.length > 500) {
            try {
              // Sample the content for beat extraction (limit to ~8000 chars for AI call)
              const sampleContent =
                fullContent.length > 8000
                  ? `${fullContent.slice(0, 4000)}\n\n...\n\n${fullContent.slice(-4000)}`
                  : fullContent;

              const { text: beatsText } = await runStoryBibleCompletion(
                "Extract scene beats from this story. Respond with JSON array of strings only.",
                `Analyze this story content and extract 6-10 scene beats that capture the narrative progression.

Each beat should be a 2-3 sentence description of a key scene/sequence that:
- Describes WHAT happens (specific actions, not labels)
- Shows the narrative flow (this leads to that)
- Is detailed enough to guide generation but not full prose
- Reads like a compact mini-scene paragraph, not an outline bullet

Example GOOD beats:
- "Roadrunner's motorcycle dies dramatically on the desert highway, and the rear tire coughs black smoke into the dawn. He rips out an ACME Portable Cliff, slaps it open, and a thirty-foot wall erupts in front of the charging riders. Their panic turns slapstick and violent at once as chrome, gravel, and mountain goats go airborne."
- "A Syndicate rider's jacket bursts into a storm of magnetized canary feathers, and the desert wind turns every plume into a needle. Roadrunner feels the pull in his own bones and nearly loses the handlebars as the magnet tries to reel him sideways. The attack leaves him hurtling toward a worse trap already forming ahead."
- "Roadrunner slaps a portable hole to his chest and folds flat for one impossible heartbeat. He slides under a hail of fire, rematerializes behind the riderless bike, and steals it before the others understand what vanished. The theft flips pursuit into confusion and buys him one savage breath of freedom."

Example BAD beats (don't do these):
- "Magnet ambush" (too vague)
- "Roadrunner escapes using clever tactics" (no specifics)

Story content to analyze:
${sampleContent}

Return JSON array of beat strings only.`,
                1500, // output limit
              );

              const parsedBeats = JSON.parse(deps.extractJSON(beatsText));
              if (Array.isArray(parsedBeats) && parsedBeats.length > 0) {
                beats = sanitizeGeneratedSceneBeats(
                  parsedBeats
                    .filter(
                      (b: unknown) => typeof b === "string" && b.length > 30,
                    )
                    .slice(0, 10),
                );

                sourceLogger.info("AI beat extraction completed", {
                  beatCount: beats.length,
                  sampleBeats: beats
                    .slice(0, 2)
                    .map((b: string) => b.slice(0, 150)),
                });
              }
            } catch (error) {
              sourceLogger.warn("AI beat extraction failed, using fallback", {
                error: String(error),
              });
            }
          }

          // Fallback: extract from paragraphs if AI failed
          if (beats.length === 0 && fullContent) {
            const paragraphs = fullContent
              .split(/\n\n+/)
              .map((p) => p.replace(/\s+/g, " ").trim())
              .filter((p) => p.length > 100 && p.length < 500);

            // Take 8-12 diverse paragraphs as beats
            const stride = Math.max(1, Math.floor(paragraphs.length / 10));
            const selectedParagraphs = [];
            for (
              let idx = 0;
              idx < paragraphs.length && selectedParagraphs.length < 10;
              idx += stride
            ) {
              selectedParagraphs.push(paragraphs[idx]);
            }

            beats = sanitizeGeneratedSceneBeats(
              selectedParagraphs.map((para) => {
                const sentences = para
                  .split(/[.!?]+/)
                  .filter((s) => s.trim().length > 15);
                if (sentences.length >= 2) {
                  const beat = `${sentences[0].trim()}. ${sentences[1].trim()}.`;
                  return beat.length > 300 ? `${beat.slice(0, 297)}...` : beat;
                }
                return para.length > 300 ? `${para.slice(0, 297)}...` : para;
              }),
            );
          }

          // Fallback to act.keyEvents if no content beats extracted
          if (beats.length === 0 && act.keyEvents && act.keyEvents.length > 0) {
            const beatsPerChapter = Math.ceil(
              act.keyEvents.length / chapterCount,
            );
            const startBeatIdx = i * beatsPerChapter;
            beats = buildActDrivenSceneBeats({
              act,
              events: act.keyEvents,
              startIndex: startBeatIdx,
              chapterCount: beatsPerChapter,
              characters: actCharacters,
              tone: storyBible.premise?.tone,
              synopsis: storyBible.premise?.synopsis,
              setting: storyBible.world?.setting,
              threadStatus,
            });
          }

          chapters.push({
            chapterNumber: chapterNum,
            title: `Chapter ${chapterNum}`,
            summary:
              chapNum === actStart
                ? `Opening of Act ${act.number}: ${act.name}. ${act.description.split(".")[0]}.${threadStatus.length > 0 ? ` ${threadStatus.join("; ")}.` : ""}`
                : chapNum === actEnd
                  ? `Closing of Act ${act.number}: ${act.name}.${threadStatus.length > 0 ? ` ${threadStatus.join("; ")}.` : ""}`
                  : `Act ${act.number}: ${act.name} continues.${threadStatus.length > 0 ? ` ${threadStatus.join("; ")}.` : ""}`,
            beats,
            characters: actCharacters,
            location: "",
            timeframe: "",
          });
          chapterNum++;
        }
      }

      sourceLogger.info("Created enriched chapters from acts", {
        count: chapters.length,
      });
      return chapters;
    }

    const outlines: StoryBible["chapterOutlines"] = [];

    for (
      let index = 0;
      index < orderedChapters.length;
      index += CHAPTER_OUTLINE_BATCH_SIZE
    ) {
      const batch = orderedChapters.slice(
        index,
        index + CHAPTER_OUTLINE_BATCH_SIZE,
      );
      const chapterContent = batch
        .map((chapter) => {
          const normalized = normalizeExtractionText(chapter.content || "");
          if (!normalized) return "";
          return `=== Chapter ${chapter.chapterNumber}: ${chapter.title || `Chapter ${chapter.chapterNumber}`} ===\n\n${buildRepresentativeExcerpt(normalized, STORY_BIBLE_CHAPTER_SAMPLE_CHARS)}`;
        })
        .filter(Boolean)
        .join("\n\n");

      if (chapterContent.length < 50) {
        outlines.push(
          ...batch.map((chapter) =>
            allowFallbackOutlines
              ? buildFallbackChapterOutline(chapter)
              : buildMinimalChapterOutline(chapter),
          ),
        );
        continue;
      }

      try {
        const { text: outlineText } = await runStoryBibleCompletion(
          "You are a thorough story analyst. Respond only with valid JSON.",
          `Extract chapter outlines from ONLY the chapters below.

Each chapter outline should be rich, specific, and chapter-level.
- Write a 4-7 sentence summary that captures setup, conflict, reveal, consequence, and the final turn into the next chapter.
- If the source is already an outline or chapter synopsis, preserve that level of detail instead of compressing it.
- Extract 4-10 scene beats per chapter when the material supports it.
- CRITICAL: Each beat must be a 2-4 sentence MINI-SCENE DESCRIPTION, not a label. Include:
  • Specific character actions (what they DO, not just "confrontation")
  • Sensory details (what it feels/looks/sounds like)
  • Emotional beats or turning points
  • Forward pressure into what the beat causes next
- Each beat string must contain multiple full sentences. Do not output one-sentence outline bullets.
  • Example BAD: "magnet hijacking" 
  • Example GOOD: "Roadrunner's skeleton lurches toward the magnet, hollow bones screaming. He yanks throttle hard left, bike twisting mid-air against the pull. Rearview shows Canary's face cycling through surprise to rage."
- Short quoted dialogue fragments are encouraged when they capture character voice.
- Do NOT treat act headings or general story-bible section headings as chapters.
- Do not invent future plot or missing scenes.

Return JSON array:
[{"chapterNumber": N, "title": "chapter title", "summary": "rich multi-sentence chapter summary", "beats": ["scene beat 1", "scene beat 2"], "characters": ["names"], "location": "primary location", "timeframe": "when in story"}]

CHAPTERS:
${chapterContent}

Return ONLY the JSON array.`,
          Math.min(7000, deps.tokenLimits.STORY_BIBLE_EXTRACT.output),
        );

        const parsed = JSON.parse(deps.extractJSON(outlineText));
        const parsedOutlines = Array.isArray(parsed) ? parsed : [];
        const byNumber = new Map<number, Partial<ChapterOutline>>();
        for (const outline of parsedOutlines) {
          const chapterNumber = Number(
            (outline as Partial<ChapterOutline>)?.chapterNumber,
          );
          if (Number.isFinite(chapterNumber)) {
            byNumber.set(chapterNumber, outline as Partial<ChapterOutline>);
          }
        }

        outlines.push(
          ...batch.map((chapter) =>
            normalizeChapterOutlinePayload(
              byNumber.get(chapter.chapterNumber),
              chapter,
              allowFallbackOutlines,
            ),
          ),
        );
      } catch (error) {
        sourceLogger.warn(
          allowFallbackOutlines
            ? "Chapter outline extraction failed; falling back to lightweight summaries"
            : "Chapter outline extraction failed; falling back to minimal outlines",
          {
            error: String(error),
            chapterNumbers: batch.map((chapter) => chapter.chapterNumber),
          },
        );
        outlines.push(
          ...batch.map((chapter) =>
            allowFallbackOutlines
              ? buildFallbackChapterOutline(chapter)
              : buildMinimalChapterOutline(chapter),
          ),
        );
      }
    }

    return outlines.sort(
      (left, right) => left.chapterNumber - right.chapterNumber,
    );
  };

  app.get("/api/projects/:id/story-bible", (req: Request, res: Response) => {
    deps.trackRequest("/api/projects/:id/story-bible");
    const project = deps.projects.get(req.params.id);
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    res.json(project.storyBible || null);
  });

  app.put("/api/projects/:id/story-bible", (req: Request, res: Response) => {
    deps.trackRequest("/api/projects/:id/story-bible");
    const project = deps.projects.get(req.params.id);
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    project.storyBible = normalizeStoryBiblePayload(
      req.body as Partial<StoryBible>,
    );
    project.updatedAt = new Date().toISOString();
    deps.persistProjects();

    res.json(project.storyBible);
  });

  app.post(
    "/api/projects/:id/story-bible/extract",
    async (req: Request, res: Response) => {
      deps.trackRequest("/api/projects/:id/story-bible/extract");
      const project = deps.projects.get(req.params.id);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      const { text, allowFallbackOutlines } = req.body;
      const sourceText = buildProjectExtractionSource(
        project,
        typeof text === "string" ? text : "",
      );

      if (!sourceText || sourceText.length < deps.config.MIN_EXTRACTION_CHARS) {
        return res.status(400).json({
          error: "Need at least 100 characters of text to extract from",
        });
      }

      try {
        const model = deps.getStoryBibleModel();
        const provider = deps.getStoryBibleProvider(model);
        const coreText = buildRepresentativeExcerpt(
          sourceText,
          STORY_BIBLE_CORE_SAMPLE_CHARS,
        );

        deps.logger.info("Story bible extraction started", {
          projectId: project.id,
          sourceLength: sourceText.length,
          sampledLength: coreText.length,
          model,
          provider: provider?.type,
          chapters: getOutlineExtractionChapters(
            project,
            typeof text === "string" ? text : "",
          ).length,
        });

        const existingStoryBible = normalizeStoryBiblePayload(
          project.storyBible || createDefaultStoryBible(),
        );
        let storyBible = existingStoryBible;
        let coreResponseText = "";
        const jsonSeed = parseStoryBibleJsonSeed(sourceText);
        const structuredSeed =
          jsonSeed || parseStructuredStoryBibleSeed(sourceText);
        const authoritativeCharacterSeed =
          Boolean(structuredSeed?.characters.length) &&
          (Boolean(jsonSeed) || looksLikeLabeledCharacterDossiers(sourceText));
        const canReplaceWeakExistingCharacters =
          authoritativeCharacterSeed &&
          (existingStoryBible.characters.length === 0 ||
            existingStoryBible.characters.every(isLowSignalCharacter));

        if (structuredSeed) {
          deps.logger.info("Structured story-bible source detected", {
            projectId: project.id,
            characters: structuredSeed.characters.length,
            chapterOutlines: structuredSeed.chapterOutlines.length,
            acts: structuredSeed.plotStructure.acts.length,
          });
          storyBible = mergeStoryBible(storyBible, structuredSeed);
          if (authoritativeCharacterSeed && canReplaceWeakExistingCharacters) {
            storyBible.characters = structuredSeed.characters;
          }
        }

        storyBible.characters = repairCharacterRoster(
          storyBible.characters,
          sourceText,
          deps.logger,
        );

        if (jsonSeed) {
          storyBible.chapterOutlines = attachCharactersToChapterOutlines(
            synchronizeChapterOutlineCharacters(
              storyBible.chapterOutlines,
              storyBible.characters,
            ),
            storyBible.characters,
          );
          project.storyBible = normalizeStoryBiblePayload(storyBible);
          project.updatedAt = new Date().toISOString();
          deps.persistProjects();
          return res.json(project.storyBible);
        }

        try {
          ({ text: coreResponseText } = await runStoryBibleCompletion(
            "You are a precise story analyst. Extract a rich story bible foundation. Respond only with valid JSON.",
            `Analyze this story text and extract a Story Bible foundation.

Important constraints:
- Be detailed and specific, not generic.
- Do NOT include chapter outlines or scene beats in this pass.
- Do NOT invent future plot developments.
- Preserve richness already present in the source material.
- If a field is unknown, use an empty string or empty array.

Return JSON matching this structure:
{
  "premise": {
    "logline": "one sentence summary",
    "synopsis": "2-4 dense paragraphs",
    "themes": ["theme1", "theme2"],
    "tone": "tone descriptor",
    "genre": "genre"
  },
  "characters": [],
  "world": {
    "setting": "rich setting description",
    "timePeriod": "when it takes place",
    "locations": [{"name": "", "description": "", "significance": ""}],
    "rules": ["world rule 1"]
  },
  "plotStructure": {
    "acts": [{"number": 1, "name": "", "description": "rich act description", "keyEvents": [], "chapterRange": {"start": 1, "end": 3}}],
    "plotThreads": [{"id": "uuid", "name": "", "type": "main/subplot/character-arc/mystery/romance", "description": "", "status": "setup/active/dormant/resolved", "introducedIn": 1, "resolvedIn": null, "tension": "low/medium/high/critical", "keyCharacters": ["character name"], "currentState": "where this thread stands now", "nextMilestone": "what needs to happen next"}]
  },
  "chapterOutlines": [],
  "styleDirectives": {
    "pov": "first/third-limited/third-omniscient",
    "tense": "past/present",
    "proseStyle": "style description",
    "dialogueStyle": "dialogue approach"
  }
}

TEXT TO ANALYZE:
${coreText}

Return ONLY the JSON object.`,
            Math.min(9000, deps.tokenLimits.STORY_BIBLE_EXTRACT.output),
          ));

          deps.logger.info("Story bible core extraction response received", {
            responseLength: coreResponseText.length,
            preview: coreResponseText.slice(0, 200),
          });

          const extractedStoryBible = normalizeStoryBiblePayload(
            JSON.parse(
              deps.extractJSON(coreResponseText),
            ) as Partial<StoryBible>,
          );
          if (authoritativeCharacterSeed) {
            extractedStoryBible.characters = [];
          }
          storyBible = mergeStoryBible(storyBible, extractedStoryBible);
        } catch (coreError) {
          deps.logger.warn(
            "Story bible core extraction failed; continuing with fallback passes",
            {
              error: String(coreError),
              responseLength: coreResponseText.length,
              responsePreview: coreResponseText.slice(0, 500) || "empty",
            },
          );
        }

        if (authoritativeCharacterSeed && structuredSeed) {
          if (
            canReplaceWeakExistingCharacters ||
            !storyBible.characters.length
          ) {
            storyBible.characters = structuredSeed.characters;
          }
        } else {
          const { characters } = await runCharacterExtraction({
            sourceText,
            existingCharacters: storyBible.characters || [],
            enrichExisting: true,
            logger: deps.logger,
          });
          storyBible.characters = characters;
        }
        storyBible.characters = repairCharacterRoster(
          storyBible.characters,
          sourceText,
          deps.logger,
        );
        const extractedChapterOutlines = await extractChapterOutlines(
          project,
          storyBible,
          deps.logger,
          typeof text === "string" ? text : "",
          Boolean(allowFallbackOutlines),
        );
        storyBible.chapterOutlines = attachCharactersToChapterOutlines(
          synchronizeChapterOutlineCharacters(
            mergeChapterOutlines(
              storyBible.chapterOutlines,
              extractedChapterOutlines,
            ),
            storyBible.characters,
          ),
          storyBible.characters,
        );

        project.storyBible = normalizeStoryBiblePayload(storyBible);
        project.updatedAt = new Date().toISOString();
        deps.persistProjects();

        res.json(project.storyBible);
      } catch (error) {
        deps.logger.error("Story bible extraction error", {
          error: String(error),
        });
        res.status(500).json({ error: String(error) });
      }
    },
  );

  app.post(
    "/api/projects/:id/story-bible/extract-iterative",
    async (req: Request, res: Response) => {
      deps.trackRequest("/api/projects/:id/story-bible/extract-iterative");
      const extractLogger = deps.createLogger("extract-iterative");
      const project = deps.projects.get(req.params.id);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      const { text, enrichExisting = true } = req.body;
      const sourceText = buildProjectExtractionSource(
        project,
        typeof text === "string" ? text : "",
      );

      if (!sourceText || sourceText.length < deps.config.MIN_EXTRACTION_CHARS) {
        return res.status(400).json({
          error: "Need at least 100 characters of text to extract from",
        });
      }

      extractLogger.info("Starting iterative extraction", {
        projectId: project.id,
        textLength: sourceText.length,
        chapters: getOutlineExtractionChapters(
          project,
          typeof text === "string" ? text : "",
        ).length,
      });

      if (!project.storyBible) {
        project.storyBible = createDefaultStoryBible();
      }

      try {
        const jsonSeed = parseStoryBibleJsonSeed(sourceText);
        const structuredSeed =
          jsonSeed || parseStructuredStoryBibleSeed(sourceText);
        const authoritativeCharacterSeed =
          Boolean(structuredSeed?.characters.length) &&
          (Boolean(jsonSeed) || looksLikeLabeledCharacterDossiers(sourceText));
        const existingStoryBible = normalizeStoryBiblePayload(
          project.storyBible,
        );

        if (structuredSeed) {
          project.storyBible = mergeStoryBible(
            existingStoryBible,
            structuredSeed,
          );
          if (
            authoritativeCharacterSeed &&
            (existingStoryBible.characters.length === 0 ||
              existingStoryBible.characters.every(isLowSignalCharacter))
          ) {
            project.storyBible.characters = structuredSeed.characters;
          }
        }

        let extractionMetrics = buildEmptyCharacterExtractionMetrics();
        if (!(authoritativeCharacterSeed && structuredSeed)) {
          const extractionResult = await runCharacterExtraction({
            sourceText,
            existingCharacters: project.storyBible.characters || [],
            enrichExisting,
            logger: extractLogger,
          });
          project.storyBible.characters = extractionResult.characters;
          extractionMetrics = extractionResult.extractionMetrics;
        }

        project.storyBible.characters = repairCharacterRoster(
          project.storyBible.characters,
          sourceText,
          extractLogger,
        );

        // Extract chapters if acts exist but no chapters yet
        if (
          project.storyBible.plotStructure.acts.length > 0 &&
          (!project.storyBible.chapterOutlines ||
            project.storyBible.chapterOutlines.length === 0)
        ) {
          project.storyBible.chapterOutlines = await extractChapterOutlines(
            project,
            project.storyBible,
            extractLogger,
            typeof text === "string" ? text : "",
            false,
          );
        }

        project.storyBible.chapterOutlines = attachCharactersToChapterOutlines(
          synchronizeChapterOutlineCharacters(
            project.storyBible.chapterOutlines,
            project.storyBible.characters,
          ),
          project.storyBible.characters,
        );

        project.updatedAt = new Date().toISOString();
        deps.persistProjects();

        deps.trackExtraction(
          authoritativeCharacterSeed && structuredSeed
            ? 0
            : CHARACTER_EXTRACTION_PASSES.length,
          extractionMetrics.totalCharactersFound,
          extractionMetrics.totalNewAdded,
          extractionMetrics.totalDuplicatesSkipped,
          extractionMetrics.totalEnriched,
        );

        extractLogger.info("Iterative extraction complete", extractionMetrics);

        res.json({
          storyBible: project.storyBible,
          extractionMetrics,
        });
      } catch (error) {
        extractLogger.error("Iterative extraction error", {
          error: String(error),
        });
        res.status(500).json({ error: String(error) });
      }
    },
  );

  app.post("/api/projects/:id/characters", (req: Request, res: Response) => {
    deps.trackRequest("/api/projects/:id/characters");
    const project = deps.projects.get(req.params.id);
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    if (!project.storyBible) {
      project.storyBible = createDefaultStoryBible();
    }

    const character = normalizeCharacterPayload({
      ...req.body,
      id: crypto.randomUUID(),
      name: req.body.name || "New Character",
      role: req.body.role || "supporting",
      voice: req.body.voice || {
        vocabulary: "moderate",
        speechPatterns: [],
        catchphrases: [],
      },
    });

    project.storyBible.characters.push(character);
    project.updatedAt = new Date().toISOString();
    deps.persistProjects();

    res.json(character);
  });

  app.put(
    "/api/projects/:projectId/characters/:characterId",
    (req: Request, res: Response) => {
      deps.trackRequest("/api/projects/:projectId/characters/:characterId");
      const project = deps.projects.get(req.params.projectId);
      if (!project?.storyBible) {
        return res
          .status(404)
          .json({ error: "Project or story bible not found" });
      }

      const characterIndex = project.storyBible.characters.findIndex(
        (character) => character.id === req.params.characterId,
      );
      if (characterIndex === -1) {
        return res.status(404).json({ error: "Character not found" });
      }

      project.storyBible.characters[characterIndex] = normalizeCharacterPayload(
        {
          ...project.storyBible.characters[characterIndex],
          ...req.body,
          id: req.params.characterId,
        },
      );
      project.updatedAt = new Date().toISOString();
      deps.persistProjects();

      res.json(project.storyBible.characters[characterIndex]);
    },
  );

  app.delete(
    "/api/projects/:projectId/characters/:characterId",
    (req: Request, res: Response) => {
      deps.trackRequest("/api/projects/:projectId/characters/:characterId");
      const project = deps.projects.get(req.params.projectId);
      if (!project?.storyBible) {
        return res
          .status(404)
          .json({ error: "Project or story bible not found" });
      }

      const characterIndex = project.storyBible.characters.findIndex(
        (character) => character.id === req.params.characterId,
      );
      if (characterIndex === -1) {
        return res.status(404).json({ error: "Character not found" });
      }

      project.storyBible.characters.splice(characterIndex, 1);
      project.updatedAt = new Date().toISOString();
      deps.persistProjects();

      res.json({ deleted: true });
    },
  );

  // POST /api/projects/:id/expand-synopsis - Generate chapter structure from synopsis/brain dump
  app.post(
    "/api/projects/:id/expand-synopsis",
    async (req: Request, res: Response) => {
      deps.trackRequest("/api/projects/:id/expand-synopsis");
      const expandLogger = deps.createLogger("expand-synopsis");
      const project = deps.projects.get(req.params.id);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      const { synopsis, targetChapters } = req.body;
      if (
        !synopsis ||
        typeof synopsis !== "string" ||
        synopsis.trim().length < 100
      ) {
        return res
          .status(400)
          .json({ error: "Synopsis must be at least 100 characters" });
      }

      const chapterCount =
        typeof targetChapters === "number" &&
        targetChapters >= 3 &&
        targetChapters <= 50
          ? targetChapters
          : 10;

      expandLogger.info("Expanding synopsis into chapter structure", {
        projectId: project.id,
        synopsisLength: synopsis.length,
        targetChapters: chapterCount,
      });

      try {
        const useCompactOutput = chapterCount > 12;
        const summaryShape = useCompactOutput
          ? "Lean summaries (1-2 sentences each, with setup, turn, and forward pull)"
          : "Rich summaries (2-4 sentences each, with setup, turn, consequence, and forward pull)";
        const beatCountGuidance = useCompactOutput ? "2-4" : "3-5";
        const beatSentenceGuidance = useCompactOutput ? "1-2" : "2-4";
        const compactInstruction = useCompactOutput
          ? "Because the chapter count is large, keep the output compact and strictly parseable. Favor concise but specific beats over long prose."
          : "";

        const systemPrompt = `You are a professional story development editor. Your task is to analyze a synopsis or brain dump and suggest a chapter-by-chapter structure.

Guidelines:
- Suggest ${chapterCount} chapters that best serve the story
- Each chapter should have a clear purpose and advance the plot
- Consider pacing: mix action, character development, and quieter moments
- Ensure logical progression and cause-effect between chapters
- Don't force extra chapters if the story naturally fits fewer
- Return ONLY valid JSON
${compactInstruction ? `- ${compactInstruction}` : ""}

CRITICAL: This is a SUGGESTION. The author will review and can accept/reject/modify each chapter.`;

        const userMessage = `Based on this story synopsis, suggest a chapter structure.

SYNOPSIS/BRAIN DUMP:
${synopsis.slice(0, 8000)}

Suggest ${chapterCount} chapters with:
1. Chapter titles
2. ${summaryShape}
3. ${beatCountGuidance} scene beats per chapter
4. Suggested POV character
5. Estimated word count per chapter

CRITICAL:
- Each beat string must contain ${beatSentenceGuidance} FULL SENTENCES. Do not write fragments.
- Each beat must read like a compact mini-scene paragraph, not an outline bullet.
- Name the characters in the scene when possible.
- Describe the deterministic action, emotional pressure, and what the beat sets up next.
- Include concrete physical/sensory detail when possible so the beat can be written from directly.
- Avoid generic placeholders like "confrontation," "twist," or "characters respond."

Return JSON array of chapter objects:
{
  "chapters": [
    {
      "chapterNumber": 1,
      "title": "Chapter Title",
      "summary": "What happens in this chapter...",
      "beats": ["Beat 1", "Beat 2", "Beat 3"],
      "suggestedPOV": "Character Name",
      "estimatedWords": 3000
    }
  ],
  "storyNotes": "Optional notes about structure decisions, pacing suggestions, or alternatives considered"
}`;

        const parseSynopsisExpansion = (
          responseText: string,
          stage: "initial" | "repair" | "retry",
        ): {
          chapters: Array<{
            chapterNumber: number;
            title: string;
            summary: string;
            beats: string[];
            suggestedPOV?: string;
            estimatedWords?: number;
          }>;
          storyNotes?: string;
        } => {
          const jsonText = deps.extractJSON(responseText);
          try {
            return JSON.parse(jsonText) as {
              chapters: Array<{
                chapterNumber: number;
                title: string;
                summary: string;
                beats: string[];
                suggestedPOV?: string;
                estimatedWords?: number;
              }>;
              storyNotes?: string;
            };
          } catch (error) {
            const position = extractJsonParseErrorPosition(error);
            expandLogger.warn("Expand synopsis JSON parse failed", {
              stage,
              error: String(error),
              responseLength: responseText.length,
              jsonLength: jsonText.length,
              parsePosition: position,
              jsonErrorContext: buildJsonErrorContext(jsonText, position),
              responseHead: responseText.slice(0, 500),
              responseTail: responseText.slice(-500),
            });
            throw error;
          }
        };

        const { text: responseText } = await runStoryBibleCompletion(
          systemPrompt,
          userMessage,
          deps.tokenLimits.STORY_BIBLE_EXTRACT.output,
        );

        let parsed: {
          chapters: Array<{
            chapterNumber: number;
            title: string;
            summary: string;
            beats: string[];
            suggestedPOV?: string;
            estimatedWords?: number;
          }>;
          storyNotes?: string;
        };

        try {
          parsed = parseSynopsisExpansion(responseText, "initial");
        } catch (initialError) {
          expandLogger.warn("Attempting synopsis JSON repair pass", {
            projectId: project.id,
            targetChapters: chapterCount,
            compactMode: useCompactOutput,
            initialError: String(initialError),
          });

          try {
            const { text: repairedText } = await runStoryBibleCompletion(
              "You repair malformed JSON for a story-planning tool. Return ONLY valid JSON. Preserve the structure and content as much as possible. Do not explain anything.",
              `Repair this malformed JSON so it parses as one valid JSON object.

Required schema:
{
  "chapters": [
    {
      "chapterNumber": 1,
      "title": "Chapter Title",
      "summary": "Summary",
      "beats": ["Beat 1", "Beat 2"],
      "suggestedPOV": "Character Name",
      "estimatedWords": 3000
    }
  ],
  "storyNotes": "Optional notes"
}

Malformed JSON:
${deps.extractJSON(responseText).slice(0, 30000)}`,
              deps.tokenLimits.STORY_BIBLE_EXTRACT.output,
            );

            parsed = parseSynopsisExpansion(repairedText, "repair");
            expandLogger.info("Synopsis expansion recovered via JSON repair", {
              projectId: project.id,
              targetChapters: chapterCount,
            });
          } catch (repairError) {
            expandLogger.warn(
              "Synopsis JSON repair failed; retrying with stricter compact prompt",
              {
                projectId: project.id,
                targetChapters: chapterCount,
                repairError: String(repairError),
              },
            );

            const retryMessage = `${userMessage}

STRICT MODE:
- Return strictly valid JSON only.
- Keep summaries concise.
- Keep beats short but specific.
- Do not include markdown fences.
- Do not include trailing commas.
- Ensure the final JSON is complete and closed.`;

            const { text: retryText } = await runStoryBibleCompletion(
              systemPrompt,
              retryMessage,
              deps.tokenLimits.STORY_BIBLE_EXTRACT.output,
            );
            parsed = parseSynopsisExpansion(retryText, "retry");
            expandLogger.info(
              "Synopsis expansion recovered via strict regeneration retry",
              {
                projectId: project.id,
                targetChapters: chapterCount,
              },
            );
          }
        }

        const chapterOutlines: ChapterOutline[] = (parsed.chapters || []).map(
          (chapter, idx) => normalizeSuggestedChapterOutline(chapter, idx),
        );

        expandLogger.info("Synopsis expansion complete", {
          projectId: project.id,
          chaptersSuggested: chapterOutlines.length,
          compactMode: useCompactOutput,
        });

        res.json({
          chapterOutlines,
          storyNotes: parsed.storyNotes || "",
          isSuggestion: true,
        });
      } catch (error) {
        expandLogger.error("Synopsis expansion failed", {
          error: String(error),
        });
        res.status(500).json({
          error: "Failed to expand synopsis: " + String(error),
        });
      }
    },
  );
}
