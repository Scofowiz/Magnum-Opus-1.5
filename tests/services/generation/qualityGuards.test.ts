import {
  buildQualityRetryInstruction,
  collectGenerationQualityIssues,
} from "@server/src/services/generation/qualityGuards";

const REPEATED_PARAGRAPH = [
  "Mara pressed her ear against the vault door and counted each relay click before the tumblers settled.",
  "The metal carried a cold engine hum through her cheekbone, steady enough to mark the timing of the guard sweep.",
  "She mouthed the numbers once, then once again, trying to keep panic from turning the pattern to noise.",
].join(" ");

describe("qualityGuards service", () => {
  it("flags repeated paragraphs", () => {
    const text = `${REPEATED_PARAGRAPH}\n\n${REPEATED_PARAGRAPH}`;
    const issues = collectGenerationQualityIssues(text, "");

    expect(issues.some((issue) => issue.includes("Repeated paragraph"))).toBe(
      true,
    );
  });

  it("flags replayed openings against recent context", () => {
    const secondParagraph = [
      "Jonah arrived late with the stolen badge, breath frosting in the dark as the archive fans kicked harder.",
      "Mara did not look back, but she shifted just enough to make room for him beside the lock plate.",
      "They both heard the patrol elevator start to descend before either of them admitted how little time remained.",
    ].join(" ");
    const issues = collectGenerationQualityIssues(
      `${REPEATED_PARAGRAPH}\n\n${secondParagraph}`,
      `Earlier context:\n${REPEATED_PARAGRAPH}`,
    );

    expect(issues).toContain(
      "Opening paragraph replays recent chapter context instead of advancing the scene",
    );
  });

  it("flags repeated dialogue fragments", () => {
    const text = [
      '"Where is the access key?" Mara asked, keeping her voice flat while the siren wound higher through the hall.',
      '"Where is the access key?" Mara asked, keeping her voice flat while the siren wound higher through the hall.',
    ].join("\n\n");

    const issues = collectGenerationQualityIssues(text, "");
    expect(
      issues.some((issue) => issue.includes("Repeated dialogue/question")),
    ).toBe(true);
  });

  it("flags dominant sentence openings", () => {
    const text = [
      "The archive fluoresced with a tired chemical brightness that made every brass edge look diseased and every shadow feel monitored.",
      "The night staff moved in practiced diagonals between the stacks, each pass shaving another layer off Mara's nerve until she could hear her pulse in the vents.",
      "The elevator cables thrummed behind the wall like a second pulse she could not reason away, mechanical and intimate at the same time.",
      "The deadbolt on the restricted room gave half an inch before refusing her again, as if the building itself had decided she had learned enough.",
      "The smell of hot dust and toner stayed in her throat long after she stepped back from the door and tried to swallow down the warning.",
      "The pattern only sharpened when she stopped pretending the timing was coincidence and let the numbers accuse her directly.",
    ].join(" ");

    const issues = collectGenerationQualityIssues(text, "");

    expect(
      issues.some((issue) => issue.includes('Sentence openings overuse "the"')),
    ).toBe(true);
  });

  it("builds a retry instruction only when issues exist", () => {
    expect(buildQualityRetryInstruction([])).toBe("");

    expect(
      buildQualityRetryInstruction([
        'Repeated paragraph (2x): "Mara pressed her ear..."',
      ]),
    ).toContain("NARRATIVE STRUCTURE ENHANCEMENT:");

    expect(
      buildQualityRetryInstruction([
        'Repeated construction (3x): "the archive fluoresced..."',
      ]),
    ).toContain("Broaden the emotional register of the passage");
  });
});
