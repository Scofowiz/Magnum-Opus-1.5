interface ChapterLike {
  title: string;
  order: number;
}

interface ChapterOutlineLike {
  chapterNumber: number;
  title: string;
}

function normalizeTitle(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

export function parseChapterNumberFromTitle(title: string): number | null {
  const chapterMatch = title.match(/(?:chapter|ch\.?)\s*(\d+)/i);
  if (chapterMatch) return parseInt(chapterMatch[1], 10);

  const leadingMatch = title.match(/^(\d+)\./);
  if (leadingMatch) return parseInt(leadingMatch[1], 10);

  const anyMatch = title.match(/(\d+)/);
  return anyMatch ? parseInt(anyMatch[1], 10) : null;
}

export function resolveChapterOutlineForChapter<
  ChapterType extends ChapterLike,
  OutlineType extends ChapterOutlineLike,
>(
  chapter: ChapterType | null | undefined,
  outlines: readonly OutlineType[] | null | undefined,
): OutlineType | undefined {
  if (!chapter || !outlines?.length) return undefined;

  const normalizedChapterTitle = normalizeTitle(chapter.title);
  if (normalizedChapterTitle) {
    const byTitle = outlines.find(
      (outline) => normalizeTitle(outline.title) === normalizedChapterTitle,
    );
    if (byTitle) return byTitle;
  }

  const parsedChapterNumber = parseChapterNumberFromTitle(chapter.title);
  if (parsedChapterNumber !== null) {
    const byNumber = outlines.find(
      (outline) => outline.chapterNumber === parsedChapterNumber,
    );
    if (byNumber) return byNumber;
  }

  return outlines.find(
    (outline) => outline.chapterNumber === chapter.order + 1,
  );
}

export function resolveChapterNumberForChapter<
  ChapterType extends ChapterLike,
  OutlineType extends ChapterOutlineLike,
>(
  chapter: ChapterType | null | undefined,
  outlines: readonly OutlineType[] | null | undefined,
): number | undefined {
  if (!chapter) return undefined;
  return (
    resolveChapterOutlineForChapter(chapter, outlines)?.chapterNumber ||
    parseChapterNumberFromTitle(chapter.title) ||
    chapter.order + 1
  );
}
