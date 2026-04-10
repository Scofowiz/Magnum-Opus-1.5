export interface AutonomousIterationTargetOptions {
  targetWords: number;
  generatedWords: number;
  defaultWordsPerIteration: number;
  maxWordsPerIteration: number;
}

export interface AutonomousChapterEndOptions {
  explicitEndSignal: boolean;
  remainingBeatCount: number;
  targetWords: number;
  generatedWords: number;
  minimumWordRatio: number;
  minimumWordFloor: number;
}

export interface AutonomousChapterEndDecision {
  shouldHonorExplicitEnd: boolean;
  suppressedExplicitEnd: boolean;
  minimumWordsForExplicitEnd: number;
}

export function resolveAutonomousIterationTarget(
  options: AutonomousIterationTargetOptions,
): number {
  const remainingWords = Math.max(
    0,
    options.targetWords - options.generatedWords,
  );
  if (remainingWords === 0) {
    return 0;
  }

  const scaledTarget = Math.ceil(options.targetWords * 0.5);
  const preferredChunkSize = Math.max(
    options.defaultWordsPerIteration,
    Math.min(options.maxWordsPerIteration, scaledTarget),
  );

  return Math.min(preferredChunkSize, remainingWords);
}

export function resolveAutonomousChapterEndDecision(
  options: AutonomousChapterEndOptions,
): AutonomousChapterEndDecision {
  const minimumWordsForExplicitEnd = Math.min(
    options.targetWords,
    Math.max(
      Math.floor(options.targetWords * options.minimumWordRatio),
      Math.min(options.minimumWordFloor, options.targetWords),
    ),
  );

  if (!options.explicitEndSignal) {
    return {
      shouldHonorExplicitEnd: false,
      suppressedExplicitEnd: false,
      minimumWordsForExplicitEnd,
    };
  }

  if (options.remainingBeatCount <= 0) {
    return {
      shouldHonorExplicitEnd: true,
      suppressedExplicitEnd: false,
      minimumWordsForExplicitEnd,
    };
  }

  const shouldHonorExplicitEnd =
    options.generatedWords >= minimumWordsForExplicitEnd;

  return {
    shouldHonorExplicitEnd,
    suppressedExplicitEnd: !shouldHonorExplicitEnd,
    minimumWordsForExplicitEnd,
  };
}
