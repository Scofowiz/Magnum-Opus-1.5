import type { Character } from "../../domain/types.js";

const NUMBER_WORDS = new Set([
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
]);

function normalizeWhitespace(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function stripDecorativeNameTokens(value: string): string {
  return value
    .replace(/["“”'‘’][^"“”'‘’]{1,40}["“”'‘’]/g, " ")
    .replace(/\([^)]{1,60}\)/g, " ")
    .replace(
      /\b(?:sheriff|deputy|doctor|dr|mr|mrs|ms|miss|captain|professor|prof)\b/gi,
      " ",
    );
}

function hasFixedReferentTokens(value: string): boolean {
  const normalized = normalizeWhitespace(value);
  if (/\d/.test(normalized)) return true;
  const tokens = normalized.split(" ").filter(Boolean);
  return tokens.some((token) => NUMBER_WORDS.has(token));
}

function isSafePartialAlias(shorter: string, longer: string): boolean {
  if (hasFixedReferentTokens(shorter) || hasFixedReferentTokens(longer))
    return false;

  const shorterTokens = shorter.split(" ").filter(Boolean);
  const longerTokens = longer.split(" ").filter(Boolean);
  if (shorterTokens.length < 2 || longerTokens.length < 2) return false;

  return longer.startsWith(`${shorter} `) || longer.endsWith(` ${shorter}`);
}

export function normalizeCharacterName(name: string): string {
  return normalizeWhitespace(stripDecorativeNameTokens(name));
}

export function findExistingCharacter(
  characters: Character[],
  candidateName: string,
): Character | undefined {
  const normalizedCandidate = normalizeCharacterName(candidateName);
  if (!normalizedCandidate) return undefined;

  return characters.find((character) => {
    const normalizedExisting = normalizeCharacterName(character.name);
    if (!normalizedExisting) return false;
    if (normalizedExisting === normalizedCandidate) return true;

    return (
      isSafePartialAlias(normalizedCandidate, normalizedExisting) ||
      isSafePartialAlias(normalizedExisting, normalizedCandidate)
    );
  });
}

function preferRicherText(
  existing: string | undefined,
  incoming: string | undefined,
): string {
  const current = (existing || "").trim();
  const candidate = (incoming || "").trim();
  if (!current) return candidate;
  if (!candidate) return current;
  return candidate.length > current.length ? candidate : current;
}

function rolePriority(role: string | undefined): number {
  switch ((role || "").trim().toLowerCase()) {
    case "protagonist":
      return 4;
    case "antagonist":
      return 3;
    case "supporting":
    case "supportingcharacter":
      return 2;
    case "minor":
    case "minorcharacter":
      return 1;
    default:
      return 0;
  }
}

function mergeRole(
  existing: string | undefined,
  incoming: string | undefined,
): string {
  return rolePriority(incoming) > rolePriority(existing)
    ? incoming || existing || "minor"
    : existing || incoming || "minor";
}

function mergeCognitiveFilter(
  existing: Character["cognitiveFilter"] | undefined,
  incoming: Character["cognitiveFilter"] | undefined,
): Character["cognitiveFilter"] | undefined {
  if (!existing) return incoming;
  if (!incoming) return existing;

  return {
    primaryMode:
      existing.primaryMode === "analytical" &&
      incoming.primaryMode !== "analytical"
        ? incoming.primaryMode
        : existing.primaryMode || incoming.primaryMode,
    internalLanguage: preferRicherText(
      existing.internalLanguage,
      incoming.internalLanguage,
    ),
    blindSpot: preferRicherText(existing.blindSpot, incoming.blindSpot),
    repeatingThoughtLoop: preferRicherText(
      existing.repeatingThoughtLoop,
      incoming.repeatingThoughtLoop,
    ),
    forbiddenWords: [
      ...new Set([
        ...(existing.forbiddenWords || []),
        ...(incoming.forbiddenWords || []),
      ]),
    ],
    signatureThoughts: [
      ...new Set([
        ...(existing.signatureThoughts || []),
        ...(incoming.signatureThoughts || []),
      ]),
    ],
  };
}

export function enrichCharacter(
  existing: Character,
  incoming: Partial<Character>,
): Character {
  const incomingRelationships =
    (incoming.relationships as
      | Array<Character["relationships"][number] & { characterName?: string }>
      | undefined) || [];
  const mergedRelationships = [
    ...(existing.relationships || []),
    ...incomingRelationships,
  ].filter((relationship, index, all) => {
    const candidate = relationship as Character["relationships"][number] & {
      characterName?: string;
    };
    const key = `${candidate.characterId || candidate.characterName || ""}|${candidate.type || ""}|${candidate.description || ""}`;
    return (
      all.findIndex((item) => {
        const current = item as Character["relationships"][number] & {
          characterName?: string;
        };
        return (
          `${current.characterId || current.characterName || ""}|${current.type || ""}|${current.description || ""}` ===
          key
        );
      }) === index
    );
  });

  return {
    ...existing,
    role: mergeRole(existing.role, incoming.role),
    nicknames: [
      ...new Set([
        ...(existing.nicknames || []),
        ...(((incoming as Character & { nicknames?: string[] }).nicknames as
          | string[]
          | undefined) || []),
      ]),
    ],
    description: preferRicherText(existing.description, incoming.description),
    backstory: preferRicherText(existing.backstory, incoming.backstory),
    motivation: preferRicherText(existing.motivation, incoming.motivation),
    fears: [
      ...new Set([
        ...(existing.fears || []),
        ...((incoming.fears as string[] | undefined) || []),
      ]),
    ],
    flaw: preferRicherText(existing.flaw, incoming.flaw),
    arc: preferRicherText(existing.arc, incoming.arc),
    voice: {
      vocabulary:
        preferRicherText(
          existing.voice?.vocabulary,
          incoming.voice?.vocabulary,
        ) || "moderate",
      speechPatterns: [
        ...new Set([
          ...(existing.voice?.speechPatterns || []),
          ...(incoming.voice?.speechPatterns || []),
        ]),
      ],
      catchphrases: [
        ...new Set([
          ...(existing.voice?.catchphrases || []),
          ...(incoming.voice?.catchphrases || []),
        ]),
      ],
    },
    relationships: mergedRelationships,
    cognitiveFilter: mergeCognitiveFilter(
      existing.cognitiveFilter,
      incoming.cognitiveFilter,
    ),
  };
}
