import {
  mergePreferencesFromPayload,
  serializePreferencesForClient,
} from "@server/src/services/preferences/flatPreferences";
import { makeUserPreferences } from "@tests/services/helpers";

describe("flatPreferences service", () => {
  it("serializes the flat compatibility fields expected by the settings UI", () => {
    const preferences = makeUserPreferences({
      generationSettings: {
        defaultTemperature: 0.9,
        defaultTargetWords: 3200,
        promptPlannerFallbackMode: "error",
      },
      memorySettings: {
        preferredPov: "first",
      },
    });

    expect(serializePreferencesForClient(preferences)).toMatchObject({
      temperature: 0.9,
      targetWords: 3200,
      promptPlannerFallbackMode: "error",
      preferredPOV: "first",
    });
  });

  it("merges flat payloads and preserves nested preference structure", () => {
    const merged = mergePreferencesFromPayload(
      makeUserPreferences(),
      {
        targetWords: 4500,
        enablePromptPlanner: false,
        promptPlannerFallbackMode: "error",
        preferredPOV: "first",
      },
      {
        maxOneShotTargetWords: 5000,
        maxContextWindowChars: 16000,
      },
    );

    expect(merged.generationSettings.defaultTargetWords).toBe(4500);
    expect(merged.generationSettings.enablePromptPlanner).toBe(false);
    expect(merged.generationSettings.promptPlannerFallbackMode).toBe("error");
    expect(merged.memorySettings.preferredPov).toBe("first");
  });

  it("merges nested payloads and clamps out-of-range values", () => {
    const merged = mergePreferencesFromPayload(
      makeUserPreferences(),
      {
        generationSettings: {
          defaultTargetWords: 999999,
          promptPlannerTopK: 99,
          promptPlannerProvider: "",
          storyBibleModel: "x".repeat(150),
        },
        memorySettings: {
          contextWindowSize: 999999,
          persistentDirections: " one \n\n two \nthree ",
        },
        qualitySettings: {
          minThreshold: 99,
        },
      },
      {
        maxOneShotTargetWords: 5000,
        maxContextWindowChars: 16000,
      },
    );

    expect(merged.generationSettings.defaultTargetWords).toBe(5000);
    expect(merged.generationSettings.promptPlannerTopK).toBe(20);
    expect(merged.generationSettings.promptPlannerProvider).toBe("main");
    expect(merged.generationSettings.storyBibleModel).toHaveLength(120);
    expect(merged.memorySettings.contextWindowSize).toBe(16000);
    expect(merged.memorySettings.persistentDirections).toBe("one\ntwo\nthree");
    expect(merged.qualitySettings.minThreshold).toBe(10);
  });
});
