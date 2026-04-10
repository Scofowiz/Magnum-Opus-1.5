function stripCodeFences(text: string): string {
  let cleaned = text.trim();
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.slice(3);
  }
  if (cleaned.endsWith("```")) {
    cleaned = cleaned.slice(0, -3);
  }
  return cleaned.trim();
}

export function extractJSON(text: string): string {
  if (!text || text.trim().length === 0) {
    throw new Error("Empty response from AI - no JSON to extract");
  }

  let cleaned = stripCodeFences(text);

  const openBraceIdx = cleaned.indexOf("{");
  const openBracketIdx = cleaned.indexOf("[");
  const openingIndexes = [openBraceIdx, openBracketIdx].filter(
    (index) => index !== -1,
  );

  if (openingIndexes.length === 0) {
    return cleaned;
  }

  const openingIdx = Math.min(...openingIndexes);
  if (openingIdx > 0) {
    cleaned = cleaned.slice(openingIdx);
  }

  try {
    JSON.parse(cleaned);
    return cleaned;
  } catch {
    // Fall through to repair logic.
  }

  let repaired = cleaned;

  const lastCompleteComma = repaired.lastIndexOf(",");
  const lastCompleteBrace = Math.max(
    repaired.lastIndexOf("}"),
    repaired.lastIndexOf("]"),
  );

  if (lastCompleteComma > lastCompleteBrace) {
    const afterComma = repaired.slice(lastCompleteComma + 1).trim();
    if (afterComma && !afterComma.match(/^[\s\]}\d"'nft[{]/)) {
      repaired = repaired.slice(0, lastCompleteComma);
    } else if (afterComma.startsWith('"')) {
      const quoteContent = afterComma.slice(1);
      if (!quoteContent.includes('"')) {
        repaired = repaired.slice(0, lastCompleteComma);
      }
    }
  }

  let inString = false;
  let lastStringStart = -1;
  for (let i = 0; i < repaired.length; i++) {
    if (repaired[i] === '"' && (i === 0 || repaired[i - 1] !== "\\")) {
      if (!inString) {
        lastStringStart = i;
      }
      inString = !inString;
    }
  }

  if (inString && lastStringStart !== -1) {
    const beforeString = repaired.slice(0, lastStringStart);
    const lastSafeComma = beforeString.lastIndexOf(",");
    const lastSafeColon = beforeString.lastIndexOf(":");

    if (lastSafeComma > lastSafeColon) {
      repaired = repaired.slice(0, lastSafeComma);
    } else if (lastSafeColon !== -1) {
      repaired = repaired.slice(0, lastSafeColon + 1) + '""';
    }
  }

  const openBraces = (repaired.match(/\{/g) || []).length;
  const closeBraces = (repaired.match(/\}/g) || []).length;
  const openBrackets = (repaired.match(/\[/g) || []).length;
  const closeBrackets = (repaired.match(/\]/g) || []).length;

  repaired = repaired + "]".repeat(Math.max(0, openBrackets - closeBrackets));
  repaired = repaired + "}".repeat(Math.max(0, openBraces - closeBraces));

  try {
    JSON.parse(repaired);
    return repaired;
  } catch {
    for (let i = repaired.length - 1; i > repaired.length / 2; i--) {
      const char = repaired[i];
      if (char === "}" || char === "]" || char === '"' || /\d/.test(char)) {
        const attempt = repaired.slice(0, i + 1);
        const newOpenBraces = (attempt.match(/\{/g) || []).length;
        const newCloseBraces = (attempt.match(/\}/g) || []).length;
        const newOpenBrackets = (attempt.match(/\[/g) || []).length;
        const newCloseBrackets = (attempt.match(/\]/g) || []).length;

        const fixed =
          attempt +
          "]".repeat(Math.max(0, newOpenBrackets - newCloseBrackets)) +
          "}".repeat(Math.max(0, newOpenBraces - newCloseBraces));

        try {
          JSON.parse(fixed);
          return fixed;
        } catch {
          continue;
        }
      }
    }
  }

  return repaired;
}
