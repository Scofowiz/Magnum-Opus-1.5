import { DEFAULT_AI_PATTERNS } from "../types/authorExport";
import type { ExportConfig } from "../types/authorExport";
import type { AuthorDossier } from "../types/authorExport";

export function cleanAiArtifacts(
  content: string,
  config: ExportConfig["aiCleanup"],
): string {
  let cleaned = content;

  if (!config.enabled) {
    return cleaned;
  }

  // Apply default patterns
  DEFAULT_AI_PATTERNS.forEach((pattern) => {
    cleaned = cleaned.replace(pattern, "");
  });

  // Apply custom patterns
  if (config.customPatterns.length > 0) {
    config.customPatterns.forEach((patternStr) => {
      try {
        const pattern = new RegExp(patternStr, "gi");
        cleaned = cleaned.replace(pattern, "");
      } catch {
        console.warn("Invalid regex pattern:", patternStr);
      }
    });
  }

  // Remove em dashes conversion
  if (config.removeEmDashes) {
    cleaned = cleaned.replace(/--/g, "—");
  }

  // Remove double spaces
  if (config.removeDoubleSpaces) {
    cleaned = cleaned.replace(/[ \t]{2,}/g, " ");
    cleaned = cleaned.replace(/^[ \t]+/gm, "");
  }

  // Normalize quotes (smart quotes)
  if (config.normalizeQuotes) {
    // Convert straight quotes to smart quotes
    cleaned = cleaned
      .replace(/"([^"]*)"/g, '"$1"')
      .replace(/'([^']*)'/g, "'$1'");
  }

  // Remove asterisk scene breaks
  if (config.removeAsterisks) {
    cleaned = cleaned.replace(/^\s*\*+\s*$/gm, "");
    cleaned = cleaned.replace(/^\s*\*\s*\*\s*\*\s*$/gm, "");
  }

  // Clean up extra whitespace and empty lines
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");
  cleaned = cleaned.trim();

  return cleaned;
}

export function substituteVariables(
  template: string,
  author: AuthorDossier | undefined,
  projectData: {
    title: string;
    genre?: string;
    wordCount?: number;
    chapterCount?: number;
    pageNumber?: number;
  },
): string {
  if (!template) return "";

  let result = template;
  const now = new Date();

  // Author name variables
  const legalFull = author?.legalName
    ? `${author.legalName.first}${author.legalName.middle ? " " + author.legalName.middle : ""} ${author.legalName.last}${author.legalName.suffix ? " " + author.legalName.suffix : ""}`
    : "";

  const legalName = author?.legalName
    ? `${author.legalName.first} ${author.legalName.last}`
    : "";

  const lastName = author?.legalName?.last || "";
  const firstName = author?.legalName?.first || "";

  const primaryPenName =
    author?.penNames?.find((p) => p.isPrimary)?.name ||
    author?.penNames?.[0]?.name ||
    legalName ||
    "Author";

  const allPenNames =
    author?.penNames?.map((p) => p.name).join(", ") || primaryPenName;

  // Address
  const fullAddress = author?.address
    ? `${author.address.street || ""}\n${author.address.city || ""}${author.address.state ? ", " + author.address.state : ""} ${author.address.zip || ""}${author.address.country ? "\n" + author.address.country : ""}`.trim()
    : "";

  const cityState = author?.address
    ? `${author.address.city || ""}${author.address.city && author.address.state ? ", " : ""}${author.address.state || ""}`
    : "";

  // Bios
  const accoladesList = author?.accolades?.length
    ? author.accolades.map((a) => `• ${a}`).join("\n")
    : "";

  const substitutions: Record<string, string> = {
    "{authorLegalFull}": legalFull,
    "{authorLegalName}": legalName,
    "{authorLastName}": lastName,
    "{authorFirstName}": firstName,
    "{authorPenName}": primaryPenName,
    "{authorPenNames}": allPenNames,
    "{authorEmail}": author?.email || "",
    "{authorPhone}": author?.phone || "",
    "{authorAddress}": fullAddress,
    "{authorCityState}": cityState,
    "{authorBioShort}": author?.shortBio || "",
    "{authorBioMedium}": author?.mediumBio || "",
    "{authorBioLong}": author?.longBio || "",
    "{authorAccolades}": accoladesList,
    "{agentName}": author?.agent?.name || "",
    "{agentAgency}": author?.agent?.agency || "",
    "{agentEmail}": author?.agent?.email || "",
    "{title}": projectData.title || "Untitled",
    "{genre}": projectData.genre || "",
    "{wordCount}": projectData.wordCount?.toLocaleString() || "0",
    "{chapterCount}": projectData.chapterCount?.toString() || "0",
    "{date}": now.toLocaleDateString(),
    "{year}": now.getFullYear().toString(),
    "{pageNumber}": projectData.pageNumber?.toString() || "1",
  };

  Object.entries(substitutions).forEach(([key, value]) => {
    result = result.replace(
      new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"),
      value,
    );
  });

  return result;
}

export function estimatePageCount(wordCount: number): number {
  // Standard manuscript estimate: 250 words per page
  return Math.ceil(wordCount / 250);
}

export function formatChapterNumber(
  number: number,
  style: "word" | "numeral" | "none",
): string {
  if (style === "none") return "";
  if (style === "numeral") return `Chapter ${number}`;

  const words = [
    "One",
    "Two",
    "Three",
    "Four",
    "Five",
    "Six",
    "Seven",
    "Eight",
    "Nine",
    "Ten",
    "Eleven",
    "Twelve",
    "Thirteen",
    "Fourteen",
    "Fifteen",
    "Sixteen",
    "Seventeen",
    "Eighteen",
    "Nineteen",
    "Twenty",
    "Twenty-One",
    "Twenty-Two",
    "Twenty-Three",
    "Twenty-Four",
    "Twenty-Five",
    "Twenty-Six",
    "Twenty-Seven",
    "Twenty-Eight",
    "Twenty-Nine",
    "Thirty",
  ];

  if (number <= 30) {
    return `Chapter ${words[number - 1]}`;
  }

  return `Chapter ${number}`;
}
