import {
  resolveAutonomousChapterEndDecision,
  resolveAutonomousIterationTarget,
} from "@server/src/services/autonomous/chapterProgress";

describe("chapterProgress service", () => {
  it("scales autonomous chunk targets above the old 2000-word cap", () => {
    expect(
      resolveAutonomousIterationTarget({
        targetWords: 12000,
        generatedWords: 0,
        defaultWordsPerIteration: 2000,
        maxWordsPerIteration: 5000,
      }),
    ).toBe(5000);
  });

  it("caps the last autonomous chunk to the remaining words", () => {
    expect(
      resolveAutonomousIterationTarget({
        targetWords: 5000,
        generatedWords: 4200,
        defaultWordsPerIteration: 2000,
        maxWordsPerIteration: 5000,
      }),
    ).toBe(800);
  });

  it("suppresses early chapter-end signals while required beats remain", () => {
    expect(
      resolveAutonomousChapterEndDecision({
        explicitEndSignal: true,
        remainingBeatCount: 2,
        targetWords: 5000,
        generatedWords: 1900,
        minimumWordRatio: 0.8,
        minimumWordFloor: 2500,
      }),
    ).toEqual({
      shouldHonorExplicitEnd: false,
      suppressedExplicitEnd: true,
      minimumWordsForExplicitEnd: 4000,
    });
  });

  it("honors explicit chapter endings once required beats are done", () => {
    expect(
      resolveAutonomousChapterEndDecision({
        explicitEndSignal: true,
        remainingBeatCount: 0,
        targetWords: 5000,
        generatedWords: 1800,
        minimumWordRatio: 0.8,
        minimumWordFloor: 2500,
      }),
    ).toEqual({
      shouldHonorExplicitEnd: true,
      suppressedExplicitEnd: false,
      minimumWordsForExplicitEnd: 4000,
    });
  });
});
