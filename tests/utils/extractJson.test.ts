import { extractJSON } from "@server/src/utils/extractJson";

describe("extractJSON", () => {
  it("preserves array responses with leading commentary", () => {
    const response = `Here is the JSON:
[
  { "name": "Roadrunner" },
  { "name": "Wile E. Coyote" }
]`;

    expect(JSON.parse(extractJSON(response))).toEqual([
      { name: "Roadrunner" },
      { name: "Wile E. Coyote" },
    ]);
  });

  it("preserves object responses with leading commentary", () => {
    const response = `Result:
{
  "chapters": [
    { "chapterNumber": 1, "title": "Start" }
  ]
}`;

    expect(JSON.parse(extractJSON(response))).toEqual({
      chapters: [{ chapterNumber: 1, title: "Start" }],
    });
  });
});
