export interface AuthorDossier {
  legalName: {
    first: string;
    middle?: string;
    last: string;
    suffix?: string;
  };
  penNames: PenName[];
  email?: string;
  phone?: string;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    zip?: string;
    country?: string;
  };
  shortBio?: string;
  mediumBio?: string;
  longBio?: string;
  accolades?: string[];
  publications?: Publication[];
  agent?: {
    name?: string;
    agency?: string;
    email?: string;
  };
  memberships?: string[];
  website?: string;
  newsletter?: string;
  social: {
    twitter?: string;
    bluesky?: string;
    instagram?: string;
    facebook?: string;
    goodreads?: string;
    amazonAuthorPage?: string;
  };
  updatedAt?: string;
}

export interface PenName {
  name: string;
  isPrimary: boolean;
  genre?: string;
}

export interface Publication {
  title: string;
  publisher?: string;
  year?: number;
  isbn?: string;
  link?: string;
}

export interface ExportConfig {
  id: string;
  name: string;
  isPreset: boolean;
  isDefault: boolean;
  font: {
    family: string;
    size: number;
    lineHeight: number;
    weight: "normal" | "bold";
  };
  margins: {
    top: string;
    bottom: string;
    left: string;
    right: string;
  };
  paragraph: {
    indent: string;
    indentFirstOnly: boolean;
    spacing: {
      before: string;
      after: string;
    };
  };
  header: {
    enabled: boolean;
    template: string;
    align: "left" | "center" | "right";
    font?: Partial<FontConfig>;
    differentFirstPage: boolean;
    differentOddEven: boolean;
  };
  footer: {
    enabled: boolean;
    template: string;
    align: "left" | "center" | "right";
    font?: Partial<FontConfig>;
  };
  titlePage?: {
    enabled: boolean;
    template: string;
    centerContent: boolean;
    spacing: string;
  };
  chapters: {
    startOnNewPage: boolean;
    pageBreakBefore: boolean;
    chapterTitleStyle: "heading1" | "centered" | "custom";
    chapterNumbering: "word" | "numeral" | "none";
  };
  aiCleanup: {
    enabled: boolean;
    removeEmDashes: boolean;
    removeDoubleSpaces: boolean;
    normalizeQuotes: boolean;
    removeAsterisks: boolean;
    customPatterns: string[];
  };
}

export interface FontConfig {
  family: string;
  size: number;
  lineHeight: number;
  weight: "normal" | "bold";
}

export interface ExportOptions {
  title: string;
  author?: AuthorDossier;
  content: string;
  chapters?: Array<{ title: string; content: string }>;
  config?: ExportConfig;
}

export type ExportFormat = "docx" | "pdf" | "txt" | "md" | "html";

export const EXPORT_VARIABLES: Record<string, string> = {
  "{authorLegalFull}": "Full legal name",
  "{authorLegalName}": "First and last name",
  "{authorLastName}": "Last name only",
  "{authorFirstName}": "First name only",
  "{authorPenName}": "Primary pen name",
  "{authorPenNames}": "All pen names",
  "{authorEmail}": "Email address",
  "{authorPhone}": "Phone number",
  "{authorAddress}": "Full formatted address",
  "{authorCityState}": "City, State",
  "{authorBioShort}": "Short bio (50 words)",
  "{authorBioMedium}": "Medium bio (150 words)",
  "{authorBioLong}": "Long bio (300 words)",
  "{authorAccolades}": "Accolades list",
  "{agentName}": "Agent name",
  "{agentAgency}": "Agency name",
  "{agentEmail}": "Agent email",
  "{title}": "Project title",
  "{genre}": "Project genre",
  "{wordCount}": "Total word count",
  "{chapterCount}": "Number of chapters",
  "{date}": "Current date",
  "{year}": "Current year",
  "{pageNumber}": "Page number",
};

export const DEFAULT_AI_PATTERNS = [
  /\[Generated.*?\]/gi,
  /\[AI-generated.*?\]/gi,
  /\[Content generated.*?\]/gi,
  /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/g,
  /\[Continuity.*?\]/gi,
  /\[Quality.*?\]/gi,
  /\[Fallback.*?\]/gi,
];

export const DEFAULT_EXPORT_CONFIGS: ExportConfig[] = [
  {
    id: "standard-manuscript",
    name: "Standard Manuscript",
    isPreset: true,
    isDefault: true,
    font: {
      family: "Courier New",
      size: 12,
      lineHeight: 2,
      weight: "normal",
    },
    margins: { top: "1in", bottom: "1in", left: "1in", right: "1in" },
    paragraph: {
      indent: "0.5in",
      indentFirstOnly: true,
      spacing: { before: "0", after: "0" },
    },
    header: {
      enabled: true,
      template: "{authorLastName} / {title} / {pageNumber}",
      align: "right",
      differentFirstPage: true,
      differentOddEven: false,
    },
    footer: { enabled: false, template: "", align: "center" },
    titlePage: {
      enabled: true,
      template: "{title}\n\nBy\n\n{authorPenName}\n\n{wordCount} words",
      centerContent: true,
      spacing: "2em",
    },
    chapters: {
      startOnNewPage: true,
      pageBreakBefore: true,
      chapterTitleStyle: "heading1",
      chapterNumbering: "word",
    },
    aiCleanup: {
      enabled: true,
      removeEmDashes: true,
      removeDoubleSpaces: true,
      normalizeQuotes: true,
      removeAsterisks: true,
      customPatterns: [],
    },
  },
  {
    id: "modern-times",
    name: "Modern Times",
    isPreset: true,
    isDefault: false,
    font: {
      family: "Times New Roman",
      size: 12,
      lineHeight: 1.5,
      weight: "normal",
    },
    margins: { top: "1in", bottom: "1in", left: "1in", right: "1in" },
    paragraph: {
      indent: "0.5in",
      indentFirstOnly: true,
      spacing: { before: "0", after: "6pt" },
    },
    header: {
      enabled: true,
      template: "{authorPenName} — {title}",
      align: "center",
      differentFirstPage: false,
      differentOddEven: false,
    },
    footer: { enabled: false, template: "", align: "center" },
    titlePage: {
      enabled: true,
      template: "{title}\n\nby {authorPenName}",
      centerContent: true,
      spacing: "3em",
    },
    chapters: {
      startOnNewPage: true,
      pageBreakBefore: true,
      chapterTitleStyle: "centered",
      chapterNumbering: "numeral",
    },
    aiCleanup: {
      enabled: true,
      removeEmDashes: false,
      removeDoubleSpaces: true,
      normalizeQuotes: true,
      removeAsterisks: true,
      customPatterns: [],
    },
  },
  {
    id: "clean-pdf",
    name: "Clean PDF",
    isPreset: true,
    isDefault: false,
    font: {
      family: "Georgia",
      size: 11,
      lineHeight: 1.5,
      weight: "normal",
    },
    margins: { top: "0.75in", bottom: "0.75in", left: "1in", right: "1in" },
    paragraph: {
      indent: "0",
      indentFirstOnly: false,
      spacing: { before: "0", after: "12pt" },
    },
    header: {
      enabled: false,
      template: "",
      align: "right",
      differentFirstPage: false,
      differentOddEven: false,
    },
    footer: { enabled: false, template: "", align: "center" },
    titlePage: {
      enabled: false,
      template: "",
      centerContent: true,
      spacing: "2em",
    },
    chapters: {
      startOnNewPage: true,
      pageBreakBefore: false,
      chapterTitleStyle: "heading1",
      chapterNumbering: "numeral",
    },
    aiCleanup: {
      enabled: true,
      removeEmDashes: false,
      removeDoubleSpaces: true,
      normalizeQuotes: true,
      removeAsterisks: true,
      customPatterns: [],
    },
  },
];

export const AVAILABLE_FONTS = [
  "Courier New",
  "Times New Roman",
  "Georgia",
  "Garamond",
  "Palatino",
  "Book Antiqua",
  "Arial",
  "Helvetica",
  "Verdana",
];

export const FONT_SIZES = [10, 11, 12, 13, 14, 16];

export const LINE_HEIGHTS = [
  { value: 1, label: "Single" },
  { value: 1.15, label: "1.15" },
  { value: 1.5, label: "1.5" },
  { value: 2, label: "Double" },
];

export const ALIGNMENTS: Array<"left" | "center" | "right"> = [
  "left",
  "center",
  "right",
];
