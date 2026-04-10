function normalizeTextForDupes(value: string): string {
  return value
    .toLowerCase()
    .replace(/<[^>]+>/g, " ")
    .replace(/[“”"'`]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function collectGenerationQualityIssues(
  text: string,
  contextBefore: string,
): string[] {
  const issues = new Set<string>();
  const paragraphs = text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length >= 120);

  const paragraphCounts = new Map<string, { count: number; excerpt: string }>();
  for (const paragraph of paragraphs) {
    const normalized = normalizeTextForDupes(paragraph);
    if (normalized.split(/\s+/).length < 20) {
      continue;
    }
    const key = normalized.slice(0, 420);
    const existing = paragraphCounts.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      paragraphCounts.set(key, { count: 1, excerpt: paragraph.slice(0, 90) });
    }
  }
  for (const { count, excerpt } of paragraphCounts.values()) {
    if (count >= 2) {
      issues.add(`Repeated paragraph (${count}x): "${excerpt}..."`);
    }
  }

  const sentences = text
    .split(/[.!?]+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 80);
  const sentenceCounts = new Map<string, { count: number; excerpt: string }>();
  for (const sentence of sentences) {
    const normalized = normalizeTextForDupes(sentence);
    if (normalized.split(/\s+/).length < 14) {
      continue;
    }
    const key = normalized.slice(0, 240);
    const existing = sentenceCounts.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      sentenceCounts.set(key, { count: 1, excerpt: sentence.slice(0, 90) });
    }
  }
  for (const { count, excerpt } of sentenceCounts.values()) {
    if (count >= 2) {
      issues.add(`Repeated sentence (${count}x): "${excerpt}..."`);
    }
  }

  const quotedLineCounts = new Map<string, number>();
  for (const match of text.matchAll(/"([^"\n]{8,160})"/g)) {
    const normalized = normalizeTextForDupes(match[1] || "");
    if (normalized.split(/\s+/).length >= 4) {
      quotedLineCounts.set(
        normalized,
        (quotedLineCounts.get(normalized) || 0) + 1,
      );
    }
  }
  for (const [quotedLine, count] of quotedLineCounts) {
    if (count >= 2) {
      issues.add(
        `Repeated dialogue/question (${count}x): "${quotedLine.slice(0, 90)}..."`,
      );
    }
  }

  const ngramCounts = new Map<string, number>();
  const words = normalizeTextForDupes(text).split(/\s+/).filter(Boolean);
  for (let index = 0; index <= words.length - 8; index++) {
    const gram = words.slice(index, index + 8).join(" ");
    ngramCounts.set(gram, (ngramCounts.get(gram) || 0) + 1);
  }
  for (const [gram, count] of ngramCounts) {
    if (count >= 3) {
      issues.add(
        `Repeated construction (${count}x): "${gram.slice(0, 90)}..."`,
      );
      break;
    }
  }

  const paragraphLeadCounts = new Map<
    string,
    { count: number; excerpt: string }
  >();
  for (const paragraph of paragraphs) {
    const openingWords = normalizeTextForDupes(paragraph)
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 6);
    if (openingWords.length < 4) {
      continue;
    }
    const key = openingWords.join(" ");
    const existing = paragraphLeadCounts.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      paragraphLeadCounts.set(key, {
        count: 1,
        excerpt: paragraph.slice(0, 90),
      });
    }
  }
  for (const { count, excerpt } of paragraphLeadCounts.values()) {
    if (count >= 2) {
      issues.add(`Paragraph opening repeats (${count}x): "${excerpt}..."`);
    }
  }

  const openerCounts = new Map<string, number>();
  for (const sentence of sentences) {
    const words = normalizeTextForDupes(sentence).split(/\s+/).filter(Boolean);
    if (words.length < 8) {
      continue;
    }
    const opener = words[0];
    openerCounts.set(opener, (openerCounts.get(opener) || 0) + 1);
  }
  const dominantOpener = [...openerCounts.entries()].sort(
    (left, right) => right[1] - left[1],
  )[0];
  if (
    dominantOpener &&
    sentences.length >= 6 &&
    dominantOpener[1] >= Math.max(4, Math.ceil(sentences.length * 0.45))
  ) {
    issues.add(
      `Sentence openings overuse "${dominantOpener[0]}" (${dominantOpener[1]}/${sentences.length})`,
    );
  }

  const recentContext = normalizeTextForDupes(contextBefore.slice(-8000));
  const openingParagraph = normalizeTextForDupes(paragraphs[0] || "");
  if (
    openingParagraph &&
    openingParagraph.split(/\s+/).length >= 18 &&
    recentContext.includes(
      openingParagraph.slice(0, Math.min(openingParagraph.length, 220)),
    )
  ) {
    issues.add(
      "Opening paragraph replays recent chapter context instead of advancing the scene",
    );
  }

  return [...issues].slice(0, 4);
}

export function buildQualityRetryInstruction(issues: string[]): string {
  if (issues.length === 0) {
    return "";
  }

  return [
    "NARRATIVE STRUCTURE ENHANCEMENT:",
    `- Targeted fixes for this pass: ${issues.join("; ")}`,
    "- Advance the next required story beat directly and with momentum.",
    "- Shift the emotional register across the passage — move through contrast, not a single sustained mood.",
    "- Give each paragraph its own sentence shape, launch word, and image.",
    "- Let feeling arrive through action, subtext, and sensory consequence rather than stated interiority.",
    "- Keep description purposeful and tied to the beat transition ahead.",
    "- Serve the current beat, prepare naturally for the next — then stop.",
  ].join("\n");
}
