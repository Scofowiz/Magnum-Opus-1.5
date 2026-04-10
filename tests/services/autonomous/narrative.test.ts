import { vi } from "vitest";
import { createNarrativeService } from "@server/src/services/autonomous/narrative";

const tokenLimits = {
  NARRATIVE_STATE: { input: 1200, output: 200 },
  POLISH_TEXT: { input: 2400, output: 500 },
};

describe("narrative service", () => {
  it("extracts narrative state from valid json", async () => {
    const chatCompletion = vi.fn().mockResolvedValue({
      text: JSON.stringify({
        time: "midnight",
        location: "vault corridor",
        povCharacter: "Mara",
        mood: "tense",
      }),
      tokens: 40,
    });
    const service = createNarrativeService({ chatCompletion, tokenLimits });

    await expect(service.extractNarrativeState("recent text")).resolves.toEqual(
      {
        time: "midnight",
        location: "vault corridor",
        povCharacter: "Mara",
        mood: "tense",
      },
    );
    expect(chatCompletion).toHaveBeenCalledWith(
      expect.stringContaining("narrative analyst"),
      expect.stringContaining("recent text"),
      expect.objectContaining({ maxTokens: 200 }),
    );
  });

  it("falls back to the default narrative state on parse errors", async () => {
    const service = createNarrativeService({
      chatCompletion: vi.fn().mockResolvedValue({
        text: "not json",
        tokens: 5,
      }),
      tokenLimits,
    });

    await expect(service.extractNarrativeState("recent text")).resolves.toEqual(
      {
        time: "unknown",
        location: "unknown",
        povCharacter: "unknown",
        mood: "neutral",
      },
    );
  });

  it("rethrows aborted requests and returns original text for other polish errors", async () => {
    const abortedService = createNarrativeService({
      chatCompletion: vi.fn().mockRejectedValue(new Error("Aborted")),
      tokenLimits,
    });

    await expect(
      abortedService.extractNarrativeState("recent text"),
    ).rejects.toThrow("Aborted");

    const fallbackService = createNarrativeService({
      chatCompletion: vi.fn().mockRejectedValue(new Error("provider down")),
      tokenLimits,
    });

    await expect(
      fallbackService.polishText(
        "Original text",
        {
          time: "night",
          location: "archive",
          povCharacter: "Mara",
          mood: "urgent",
        },
        "Prior context",
      ),
    ).resolves.toBe("Original text");
  });
});
