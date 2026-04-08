import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
} from "docx";
import { saveAs } from "file-saver";
import type {
  ExportOptions,
  ExportConfig,
  ExportFormat,
} from "../types/authorExport";
import {
  cleanAiArtifacts,
  substituteVariables,
  formatChapterNumber,
} from "./aiCleanup";

// Strip HTML tags and convert to plain text
function htmlToPlainText(html: string): string {
  const temp = document.createElement("div");
  temp.innerHTML = html;

  temp.querySelectorAll("p").forEach((p) => {
    p.insertAdjacentText("afterend", "\n\n");
  });
  temp.querySelectorAll("br").forEach((br) => {
    br.replaceWith("\n");
  });

  return temp.textContent?.trim() || "";
}

// Convert HTML to markdown
function htmlToMarkdown(html: string, config?: ExportConfig): string {
  let md = html;

  // Clean AI artifacts first
  if (config?.aiCleanup.enabled) {
    md = cleanAiArtifacts(md, config.aiCleanup);
  }

  md = md.replace(
    /\u003ch1[^\u003e]*\u003e(.*?)\u003c\/h1\u003e/gi,
    "# $1\n\n",
  );
  md = md.replace(
    /\u003ch2[^\u003e]*\u003e(.*?)\u003c\/h2\u003e/gi,
    "## $1\n\n",
  );
  md = md.replace(
    /\u003ch3[^\u003e]*\u003e(.*?)\u003c\/h3\u003e/gi,
    "### $1\n\n",
  );
  md = md.replace(
    /\u003cstrong[^\u003e]*\u003e(.*?)\u003c\/strong\u003e/gi,
    "**$1**",
  );
  md = md.replace(/\u003cb[^\u003e]*\u003e(.*?)\u003c\/b\u003e/gi, "**$1**");
  md = md.replace(/\u003cem[^\u003e]*\u003e(.*?)\u003c\/em\u003e/gi, "*$1*");
  md = md.replace(/\u003ci[^\u003e]*\u003e(.*?)\u003c\/i\u003e/gi, "*$1*");
  md = md.replace(/\u003cp[^\u003e]*\u003e(.*?)\u003c\/p\u003e/gi, "$1\n\n");
  md = md.replace(/\u003cbr\s*\/?\u003e/gi, "\n");
  md = md.replace(/\*\s*\*\s*\*/g, "\n* * *\n");
  md = md.replace(/\u003c[^\u003e]+\u003e/g, "");
  md = md.replace(/\n{3,}/g, "\n\n");

  return md.trim();
}

// Parse HTML into paragraphs for docx with formatting
function parseHtmlToParagraphs(
  html: string,
  config?: ExportConfig,
): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  const temp = document.createElement("div");
  temp.innerHTML = html;

  const indentSize = config?.paragraph.indent || "0";
  const hasIndent = indentSize !== "0" && indentSize !== "none";

  temp.querySelectorAll("p, h1, h2, h3").forEach((el, index) => {
    const text = el.textContent?.trim() || "";
    if (!text) return;

    const tagName = el.tagName.toLowerCase();

    if (tagName === "h1") {
      paragraphs.push(
        new Paragraph({
          text,
          heading: HeadingLevel.HEADING_1,
          spacing: { after: 200 },
          alignment:
            config?.chapters.chapterTitleStyle === "centered"
              ? AlignmentType.CENTER
              : AlignmentType.LEFT,
        }),
      );
    } else if (tagName === "h2") {
      paragraphs.push(
        new Paragraph({
          text,
          heading: HeadingLevel.HEADING_2,
          spacing: { after: 200 },
        }),
      );
    } else if (tagName === "h3") {
      paragraphs.push(
        new Paragraph({
          text,
          heading: HeadingLevel.HEADING_3,
          spacing: { after: 200 },
        }),
      );
    } else {
      const children: TextRun[] = [];

      el.childNodes.forEach((node) => {
        if (node.nodeType === Node.TEXT_NODE) {
          children.push(new TextRun({ text: node.textContent || "" }));
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          const elem = node as Element;
          const tagLower = elem.tagName.toLowerCase();
          const nodeText = elem.textContent || "";

          if (tagLower === "strong" || tagLower === "b") {
            children.push(new TextRun({ text: nodeText, bold: true }));
          } else if (tagLower === "em" || tagLower === "i") {
            children.push(new TextRun({ text: nodeText, italics: true }));
          } else {
            children.push(new TextRun({ text: nodeText }));
          }
        }
      });

      if (children.length === 0) {
        children.push(new TextRun({ text }));
      }

      // Apply indentation to first paragraph if configured
      const isFirstParagraph = index === 0;
      const shouldIndent =
        hasIndent && (!config?.paragraph.indentFirstOnly || isFirstParagraph);

      paragraphs.push(
        new Paragraph({
          children,
          spacing: {
            after: parseSpacing(config?.paragraph.spacing.after || "0"),
            before: parseSpacing(config?.paragraph.spacing.before || "0"),
          },
          indent: shouldIndent
            ? { firstLine: parseIndent(indentSize) }
            : undefined,
        }),
      );
    }
  });

  return paragraphs;
}

function parseSpacing(spacing: string): number {
  if (spacing.endsWith("pt")) {
    return parseInt(spacing);
  }
  if (spacing.endsWith("in")) {
    return Math.round(parseFloat(spacing) * 72 * 20);
  }
  return parseInt(spacing) || 0;
}

function parseIndent(indent: string): number {
  if (indent.endsWith("in")) {
    return Math.round(parseFloat(indent) * 72 * 20);
  }
  if (indent.endsWith("cm")) {
    return Math.round(parseFloat(indent) * 28.35 * 20);
  }
  if (indent.endsWith("pt")) {
    return parseInt(indent) * 20;
  }
  return parseInt(indent) || 0;
}

// Export to Word (.docx) with full configuration
export async function exportToDocx(options: ExportOptions): Promise<void> {
  const { title, author, content, chapters, config } = options;
  const cfg = config || getDefaultConfig();

  const sections = [];

  // Add title page if enabled
  if (cfg.titlePage?.enabled) {
    const titlePageContent = substituteVariables(
      cfg.titlePage.template,
      author,
      {
        title,
        wordCount:
          chapters?.reduce(
            (sum, ch) => sum + ch.content.split(/\s+/).filter(Boolean).length,
            0,
          ) || content.split(/\s+/).filter(Boolean).length,
      },
    );

    const titleParagraphs = titlePageContent.split("\n").map(
      (line) =>
        new Paragraph({
          text: line,
          alignment: cfg.titlePage?.centerContent
            ? AlignmentType.CENTER
            : AlignmentType.LEFT,
          spacing: { after: parseSpacing(cfg.titlePage?.spacing || "2em") },
        }),
    );

    sections.push({
      properties: {},
      children: titleParagraphs,
    });
  }

  if (chapters && chapters.length > 0) {
    // Multi-chapter book
    for (let i = 0; i < chapters.length; i++) {
      const chapter = chapters[i];

      // Clean AI artifacts
      let chapterContent = chapter.content;
      if (cfg.aiCleanup.enabled) {
        chapterContent = cleanAiArtifacts(chapterContent, cfg.aiCleanup);
      }

      // Format chapter title based on numbering style
      const chapterNumberText =
        cfg.chapters.chapterNumbering !== "none"
          ? formatChapterNumber(i + 1, cfg.chapters.chapterNumbering)
          : "";
      const fullChapterTitle = chapterNumberText
        ? `${chapterNumberText}: ${chapter.title}`
        : chapter.title;

      const chapterParagraphs = [
        new Paragraph({
          text: fullChapterTitle,
          heading: HeadingLevel.HEADING_1,
          spacing: { after: 400 },
          alignment:
            cfg.chapters.chapterTitleStyle === "centered"
              ? AlignmentType.CENTER
              : AlignmentType.LEFT,
          pageBreakBefore:
            cfg.chapters.pageBreakBefore ||
            (i > 0 && cfg.chapters.startOnNewPage),
        }),
        ...parseHtmlToParagraphs(chapterContent, cfg),
      ];

      sections.push({
        properties: {},
        children: chapterParagraphs,
      });
    }
  } else {
    // Single document
    let cleanedContent = content;
    if (cfg.aiCleanup.enabled) {
      cleanedContent = cleanAiArtifacts(cleanedContent, cfg.aiCleanup);
    }

    const paragraphs = [
      new Paragraph({
        text: title,
        heading: HeadingLevel.TITLE,
        spacing: { after: 400 },
      }),
      ...parseHtmlToParagraphs(cleanedContent, cfg),
    ];

    sections.push({
      properties: {},
      children: paragraphs,
    });
  }

  const doc = new Document({
    creator:
      author?.penNames?.find((p) => p.isPrimary)?.name ||
      author?.legalName?.first ||
      "NovaWrite",
    title,
    sections,
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, `${sanitizeFilename(title)}.docx`);
}

// Export to PDF with full configuration
export function exportToPdf(options: ExportOptions): void {
  const { title, author, content, chapters, config } = options;
  const cfg = config || getDefaultConfig();

  let fullContent = "";

  // Calculate total word count
  const totalWordCount =
    chapters?.reduce((sum, ch) => {
      const text = htmlToPlainText(ch.content);
      return sum + text.split(/\s+/).filter(Boolean).length;
    }, 0) || htmlToPlainText(content).split(/\s+/).filter(Boolean).length;

  // Add title page
  if (cfg.titlePage?.enabled) {
    const titlePageContent = substituteVariables(
      cfg.titlePage.template,
      author,
      {
        title,
        wordCount: totalWordCount,
      },
    );

    fullContent += `<div style="page-break-after: always; text-align: ${cfg.titlePage.centerContent ? "center" : "left"}; padding-top: 20%">`;
    titlePageContent.split("\n").forEach((line, _i) => {
      fullContent += `<div style="margin-bottom: ${cfg.titlePage?.spacing || "2em"}">${line}</div>`;
    });
    fullContent += "</div>";
  }

  if (chapters && chapters.length > 0) {
    chapters.forEach((ch, index) => {
      // Clean AI artifacts
      let chapterContent = ch.content;
      if (cfg.aiCleanup.enabled) {
        chapterContent = cleanAiArtifacts(chapterContent, cfg.aiCleanup);
      }

      // Format chapter title
      const chapterNumberText =
        cfg.chapters.chapterNumbering !== "none"
          ? formatChapterNumber(index + 1, cfg.chapters.chapterNumbering)
          : "";
      const fullChapterTitle = chapterNumberText
        ? `${chapterNumberText}: ${ch.title}`
        : ch.title;

      const pageBreak =
        cfg.chapters.pageBreakBefore ||
        (index > 0 && cfg.chapters.startOnNewPage)
          ? "page-break-before: always;"
          : "";

      const titleAlignment =
        cfg.chapters.chapterTitleStyle === "centered" ? "center" : "left";

      fullContent += `<h1 style="${pageBreak} margin-top: 2em; text-align: ${titleAlignment};">${fullChapterTitle}</h1>`;
      fullContent += chapterContent;
    });
  } else {
    let cleanedContent = content;
    if (cfg.aiCleanup.enabled) {
      cleanedContent = cleanAiArtifacts(cleanedContent, cfg.aiCleanup);
    }
    fullContent = `<h1>${title}</h1>${cleanedContent}`;
  }

  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    alert("Please allow popups to export PDF");
    return;
  }

  // Build header HTML
  let headerHtml = "";
  if (cfg.header.enabled) {
    const headerText = substituteVariables(cfg.header.template, author, {
      title,
      wordCount: totalWordCount,
    });
    const alignMap = { left: "left", center: "center", right: "right" };
    headerHtml = `
      <div style="position: running(header); text-align: ${alignMap[cfg.header.align]}; font-family: ${cfg.header.font?.family || cfg.font.family}; font-size: ${cfg.header.font?.size || cfg.font.size}pt;">
        ${headerText}
      </div>
    `;
  }

  // Parse margins
  const marginTop = parseMargin(cfg.margins.top);
  const marginBottom = parseMargin(cfg.margins.bottom);
  const marginLeft = parseMargin(cfg.margins.left);
  const marginRight = parseMargin(cfg.margins.right);

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>${title}</title>
      <style>
        @page {
          margin: ${marginTop}in ${marginRight}in ${marginBottom}in ${marginLeft}in;
          ${cfg.header.enabled ? "@top-right { content: element(header); }" : ""}
        }
        body {
          font-family: '${cfg.font.family}', serif;
          font-size: ${cfg.font.size}pt;
          line-height: ${cfg.font.lineHeight};
        }
        h1 { 
          font-size: ${Math.round(cfg.font.size * 1.5)}pt; 
          margin-bottom: 1em;
          font-weight: ${cfg.font.weight};
        }
        h2 { 
          font-size: ${Math.round(cfg.font.size * 1.2)}pt; 
          margin-bottom: 0.5em;
          font-weight: ${cfg.font.weight};
        }
        p { 
          margin-bottom: ${cfg.font.lineHeight}em; 
          text-indent: ${cfg.paragraph.indent === "none" || cfg.paragraph.indent === "0" ? "0" : cfg.paragraph.indent};
        }
        p:first-of-type { 
          text-indent: ${!cfg.paragraph.indentFirstOnly || cfg.paragraph.indent === "none" ? "0" : cfg.paragraph.indent};
        }
        @media print {
          body { margin: 0; }
          .no-print { display: none; }
        }
      </style>
    </head>
    <body>
      ${headerHtml}
      ${fullContent}
    </body>
    </html>
  `);

  printWindow.document.close();
  printWindow.print();
}

function parseMargin(margin: string): number {
  if (margin.endsWith("in")) {
    return parseFloat(margin);
  }
  if (margin.endsWith("cm")) {
    return parseFloat(margin) / 2.54;
  }
  if (margin.endsWith("mm")) {
    return parseFloat(margin) / 25.4;
  }
  return parseFloat(margin) || 1;
}

// Export to plain text with configuration
export function exportToTxt(options: ExportOptions): void {
  const { title, author, content, chapters, config } = options;
  const cfg = config || getDefaultConfig();

  let text = "";

  // Add title page
  if (cfg.titlePage?.enabled) {
    const titlePageContent = substituteVariables(
      cfg.titlePage.template,
      author,
      {
        title,
        wordCount:
          chapters?.reduce((sum, ch) => {
            const plain = htmlToPlainText(ch.content);
            return sum + plain.split(/\s+/).filter(Boolean).length;
          }, 0) || htmlToPlainText(content).split(/\s+/).filter(Boolean).length,
      },
    );
    text += titlePageContent + "\n\n" + "=".repeat(60) + "\n\n";
  }

  if (chapters && chapters.length > 0) {
    chapters.forEach((ch, index) => {
      // Clean AI artifacts
      let chapterContent = ch.content;
      if (cfg.aiCleanup.enabled) {
        chapterContent = cleanAiArtifacts(chapterContent, cfg.aiCleanup);
      }

      const chapterNumberText =
        cfg.chapters.chapterNumbering !== "none"
          ? formatChapterNumber(index + 1, cfg.chapters.chapterNumbering)
          : "";
      const fullChapterTitle = chapterNumberText
        ? `${chapterNumberText}: ${ch.title}`
        : ch.title;

      text += `${fullChapterTitle.toUpperCase()}\n\n`;
      text += htmlToPlainText(chapterContent);
      text += "\n\n---\n\n";
    });
  } else {
    let cleanedContent = content;
    if (cfg.aiCleanup.enabled) {
      cleanedContent = cleanAiArtifacts(cleanedContent, cfg.aiCleanup);
    }
    text = `${title.toUpperCase()}\n\n${htmlToPlainText(cleanedContent)}`;
  }

  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  saveAs(blob, `${sanitizeFilename(title)}.txt`);
}

// Export to Markdown with configuration
export function exportToMarkdown(options: ExportOptions): void {
  const { title, author, content, chapters, config } = options;
  const cfg = config || getDefaultConfig();

  let md = `# ${title}\n\n`;

  // Add title page
  if (cfg.titlePage?.enabled) {
    const titlePageContent = substituteVariables(
      cfg.titlePage.template,
      author,
      {
        title,
        wordCount:
          chapters?.reduce((sum, ch) => {
            const plain = htmlToPlainText(ch.content);
            return sum + plain.split(/\s+/).filter(Boolean).length;
          }, 0) || htmlToPlainText(content).split(/\s+/).filter(Boolean).length,
      },
    );
    md += titlePageContent + "\n\n---\n\n";
  }

  if (chapters && chapters.length > 0) {
    chapters.forEach((ch, index) => {
      // Clean AI artifacts
      let chapterContent = ch.content;
      if (cfg.aiCleanup.enabled) {
        chapterContent = cleanAiArtifacts(chapterContent, cfg.aiCleanup);
      }

      const chapterNumberText =
        cfg.chapters.chapterNumbering !== "none"
          ? formatChapterNumber(index + 1, cfg.chapters.chapterNumbering)
          : "";
      const fullChapterTitle = chapterNumberText
        ? `${chapterNumberText}: ${ch.title}`
        : ch.title;

      md += `## ${fullChapterTitle}\n\n`;
      md += htmlToMarkdown(chapterContent, cfg);
      md += "\n\n---\n\n";
    });
  } else {
    let cleanedContent = content;
    if (cfg.aiCleanup.enabled) {
      cleanedContent = cleanAiArtifacts(cleanedContent, cfg.aiCleanup);
    }
    md += htmlToMarkdown(cleanedContent, cfg);
  }

  const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
  saveAs(blob, `${sanitizeFilename(title)}.md`);
}

// Export to HTML with configuration
export function exportToHtml(options: ExportOptions): void {
  const { title, author, content, chapters, config } = options;
  const cfg = config || getDefaultConfig();

  let body = "";

  // Add title page
  if (cfg.titlePage?.enabled) {
    const titlePageContent = substituteVariables(
      cfg.titlePage.template,
      author,
      {
        title,
        wordCount:
          chapters?.reduce((sum, ch) => {
            const plain = htmlToPlainText(ch.content);
            return sum + plain.split(/\s+/).filter(Boolean).length;
          }, 0) || htmlToPlainText(content).split(/\s+/).filter(Boolean).length,
      },
    );

    body += `<div class="title-page">`;
    titlePageContent.split("\n").forEach((line) => {
      body += `<div class="title-line">${line}</div>`;
    });
    body += '</div><div class="page-break"></div>';
  }

  if (chapters && chapters.length > 0) {
    chapters.forEach((ch, index) => {
      // Clean AI artifacts
      let chapterContent = ch.content;
      if (cfg.aiCleanup.enabled) {
        chapterContent = cleanAiArtifacts(chapterContent, cfg.aiCleanup);
      }

      const chapterNumberText =
        cfg.chapters.chapterNumbering !== "none"
          ? formatChapterNumber(index + 1, cfg.chapters.chapterNumbering)
          : "";
      const fullChapterTitle = chapterNumberText
        ? `${chapterNumberText}: ${ch.title}`
        : ch.title;

      const alignment =
        cfg.chapters.chapterTitleStyle === "centered" ? "center" : "left";

      if (index > 0 && cfg.chapters.startOnNewPage) {
        body += '<div class="page-break"></div>';
      }

      body += `<h1 style="text-align: ${alignment}">${fullChapterTitle}</h1>\n${chapterContent}\n`;
    });
  } else {
    let cleanedContent = content;
    if (cfg.aiCleanup.enabled) {
      cleanedContent = cleanAiArtifacts(cleanedContent, cfg.aiCleanup);
    }
    body = `<h1>${title}</h1>\n${cleanedContent}`;
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body {
      font-family: '${cfg.font.family}', Georgia, serif;
      font-size: ${cfg.font.size}px;
      line-height: ${cfg.font.lineHeight};
      max-width: ${8.5 - parseFloat(cfg.margins.left || "1") - parseFloat(cfg.margins.right || "1")}in;
      margin: ${cfg.margins.top || "1in"} auto ${cfg.margins.bottom || "1in"};
      padding: 0 ${cfg.margins.left || "1in"} 0 ${cfg.margins.right || "1in"};
      color: #333;
    }
    h1 { 
      font-size: ${Math.round(cfg.font.size * 1.5)}px; 
      margin-bottom: 1em;
    }
    h2 { 
      font-size: ${Math.round(cfg.font.size * 1.2)}px; 
      margin: 1.5em 0 0.5em;
    }
    p { 
      margin-bottom: ${cfg.font.lineHeight}em;
      text-indent: ${cfg.paragraph.indent === "none" || cfg.paragraph.indent === "0" ? "0" : cfg.paragraph.indent};
    }
    p:first-of-type { 
      text-indent: ${!cfg.paragraph.indentFirstOnly || cfg.paragraph.indent === "none" ? "0" : cfg.paragraph.indent};
    }
    .title-page {
      text-align: ${cfg.titlePage?.centerContent ? "center" : "left"};
      padding-top: 20%;
      page-break-after: always;
    }
    .title-line {
      margin-bottom: ${cfg.titlePage?.spacing || "2em"};
    }
    .page-break {
      page-break-after: always;
      height: 0;
    }
    hr { 
      margin: 2em 0; 
      border: none; 
      border-top: 1px solid #ccc; 
    }
  </style>
</head>
<body>
${body}
</body>
</html>`;

  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  saveAs(blob, `${sanitizeFilename(title)}.html`);
}

// Helper function to get default config
function getDefaultConfig(): ExportConfig {
  return {
    id: "default",
    name: "Default",
    isPreset: true,
    isDefault: true,
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
      spacing: { before: "0", after: "0" },
    },
    header: {
      enabled: false,
      template: "",
      align: "right",
      differentFirstPage: false,
      differentOddEven: false,
    },
    footer: { enabled: false, template: "", align: "center" },
    chapters: {
      startOnNewPage: true,
      pageBreakBefore: false,
      chapterTitleStyle: "heading1",
      chapterNumbering: "word",
    },
    aiCleanup: {
      enabled: false,
      removeEmDashes: false,
      removeDoubleSpaces: false,
      normalizeQuotes: false,
      removeAsterisks: false,
      customPatterns: [],
    },
  };
}

// Sanitize filename
function sanitizeFilename(name: string): string {
  return name
    .replace(/[^a-z0-9]/gi, "_")
    .replace(/_+/g, "_")
    .slice(0, 50);
}

// Main export function
export async function exportDocument(
  format: ExportFormat,
  options: ExportOptions,
): Promise<void> {
  switch (format) {
    case "docx":
      await exportToDocx(options);
      break;
    case "pdf":
      exportToPdf(options);
      break;
    case "txt":
      exportToTxt(options);
      break;
    case "md":
      exportToMarkdown(options);
      break;
    case "html":
      exportToHtml(options);
      break;
  }
}

// Re-export types
export type {
  ExportConfig,
  ExportOptions,
  ExportFormat,
  AuthorDossier,
} from "../types/authorExport";
export {
  DEFAULT_EXPORT_CONFIGS,
  AVAILABLE_FONTS,
  FONT_SIZES,
  LINE_HEIGHTS,
} from "../types/authorExport";
