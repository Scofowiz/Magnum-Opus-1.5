import {
  getLengthShortfall,
  hasContinuitySystemErrors,
  isBetterGenerationCandidate,
} from "@server/src/services/generation/candidateSelection";

describe("candidateSelection service", () => {
  it("prefers an unblocked candidate over a blocked one", () => {
    expect(
      isBetterGenerationCandidate(
        {
          score: 0.4,
          lengthDelta: 50,
          lengthOk: false,
          blocked: false,
        },
        {
          score: 0.9,
          lengthDelta: 1,
          lengthOk: true,
          blocked: true,
        },
      ),
    ).toBe(true);
  });

  it("prefers length compliance before score", () => {
    expect(
      isBetterGenerationCandidate(
        {
          score: 0.2,
          lengthDelta: 40,
          lengthOk: true,
        },
        {
          score: 0.9,
          lengthDelta: 1,
          lengthOk: false,
        },
      ),
    ).toBe(true);
  });

  it("uses shorter length delta and then score as tie breakers", () => {
    expect(
      isBetterGenerationCandidate(
        {
          score: 0.4,
          lengthDelta: 8,
          lengthOk: true,
        },
        {
          score: 0.9,
          lengthDelta: 15,
          lengthOk: true,
        },
      ),
    ).toBe(true);

    expect(
      isBetterGenerationCandidate(
        {
          score: 0.8,
          lengthDelta: 8,
          lengthOk: true,
        },
        {
          score: 0.6,
          lengthDelta: 8,
          lengthOk: true,
        },
      ),
    ).toBe(true);
  });

  it("does not penalize overshooting once the minimum length is met", () => {
    expect(getLengthShortfall(5000, 5000)).toBe(0);
    expect(getLengthShortfall(5000, 6200)).toBe(0);
    expect(getLengthShortfall(5000, 4500)).toBe(500);
  });

  it("detects continuity system parse and check errors", () => {
    expect(
      hasContinuitySystemErrors([{ type: "warning" }, { type: "parse_error" }]),
    ).toBe(true);

    expect(
      hasContinuitySystemErrors([{ type: "warning" }, { type: "note" }]),
    ).toBe(false);
  });
});
