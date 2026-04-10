import {
  parseChapterNumberFromTitle,
  resolveChapterNumberForChapter,
  resolveChapterOutlineForChapter,
} from "@server/src/services/projects/chapterOutline";

describe("chapterOutline service", () => {
  it("parses chapter numbers from several title formats", () => {
    expect(parseChapterNumberFromTitle("Chapter 12: The Vault")).toBe(12);
    expect(parseChapterNumberFromTitle("7. The Bridge")).toBe(7);
    expect(parseChapterNumberFromTitle("Act 2 - Chapter 19")).toBe(19);
  });

  it("resolves outlines by exact title before numeric fallbacks", () => {
    const outlines = [
      { chapterNumber: 8, title: "Opening Move" },
      { chapterNumber: 1, title: "Chapter 1" },
    ];

    expect(
      resolveChapterOutlineForChapter(
        { title: "Opening Move", order: 0 },
        outlines,
      ),
    ).toEqual(outlines[0]);
  });

  it("falls back to parsed chapter number and then order", () => {
    const outlines = [
      { chapterNumber: 2, title: "Something Else" },
      { chapterNumber: 4, title: "Fourth Turn" },
    ];

    expect(
      resolveChapterOutlineForChapter(
        { title: "Chapter 4 - Break In", order: 0 },
        outlines,
      ),
    ).toEqual(outlines[1]);

    expect(
      resolveChapterNumberForChapter(
        { title: "Untitled Draft", order: 1 },
        outlines,
      ),
    ).toBe(2);
  });
});
