export interface GenerationCandidate {
  score: number;
  lengthDelta: number;
  lengthOk: boolean;
  blocked?: boolean;
}

interface ContinuitySystemIssue {
  type: string;
}

export function getLengthShortfall(
  targetWords: number,
  actualWordCount: number,
): number {
  return Math.max(0, targetWords - actualWordCount);
}

export function isBetterGenerationCandidate(
  candidate: GenerationCandidate,
  current: GenerationCandidate,
): boolean {
  if ((candidate.blocked ?? false) !== (current.blocked ?? false)) {
    return !candidate.blocked;
  }
  if (candidate.lengthOk !== current.lengthOk) {
    return candidate.lengthOk;
  }
  if (candidate.lengthDelta !== current.lengthDelta) {
    return candidate.lengthDelta < current.lengthDelta;
  }
  return candidate.score > current.score;
}

export function hasContinuitySystemErrors(
  issues: ContinuitySystemIssue[],
): boolean {
  return issues.some(
    (issue) => issue.type === "parse_error" || issue.type === "check_error",
  );
}
