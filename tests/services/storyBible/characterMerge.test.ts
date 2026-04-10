import {
  enrichCharacter,
  findExistingCharacter,
  normalizeCharacterName,
} from "@server/src/services/storyBible/characterMerge";
import { makeCharacter } from "@tests/services/helpers";

describe("characterMerge service", () => {
  it("normalizes names by stripping titles, nicknames, and asides", () => {
    expect(
      normalizeCharacterName('Dr. "Red" Maya Stone (lead researcher)'),
    ).toBe("maya stone");
  });

  it("finds existing characters by normalized aliases", () => {
    const character = makeCharacter({ name: "Maya Stone" });

    expect(findExistingCharacter([character], "Professor Maya Stone")).toBe(
      character,
    );
  });

  it("does not partially match numbered placeholder-style references", () => {
    const character = makeCharacter({ name: "Research Student Three" });

    expect(
      findExistingCharacter([character], "Research Student"),
    ).toBeUndefined();
  });

  it("enriches richer fields and deduplicates relationship entries", () => {
    const existing = makeCharacter({
      name: "Maya Stone",
      role: "minor",
      description: "A scientist.",
      voice: {
        vocabulary: "moderate",
        speechPatterns: ["Keeps sentences clipped."],
        catchphrases: [],
      },
      relationships: [
        {
          characterId: "",
          type: "ally",
          description: "Trusts Jonah in the field.",
        },
      ],
    });

    const incoming = {
      role: "supporting",
      description:
        "A brilliant scientist who hides panic behind exacting routines.",
      motivation: "Keep the archive out of military hands.",
      voice: {
        vocabulary: "sophisticated",
        speechPatterns: ["Keeps sentences clipped."],
        catchphrases: ["Precision first."],
      },
      relationships: [
        {
          characterName: "Jonah Vale",
          type: "ally",
          description: "Trusts Jonah in the field.",
        },
      ],
    };

    const enriched = enrichCharacter(existing, incoming);
    expect(enriched.role).toBe("supporting");
    expect(enriched.description).toContain("brilliant scientist");
    expect(enriched.motivation).toBe("Keep the archive out of military hands.");
    expect(enriched.voice.vocabulary).toBe("sophisticated");
    expect(enriched.voice.catchphrases).toEqual(["Precision first."]);
    expect(enriched.relationships).toHaveLength(2);
  });
});
