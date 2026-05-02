import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  BorderStyle,
  ShadingType,
  Header,
  ImageRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  convertInchesToTwip,
} from "docx";
import type { EmailTemplate, TemplateSection } from "./emailTemplates";
import fs from "fs";
import path from "path";

// Amber highlight for placeholder fields
const AMBER_HIGHLIGHT = "FFD966";
const AMBER_SHADING = "FFF3CD";

function buildRuns(text: string, placeholder: boolean, bold = false): TextRun[] {
  if (!placeholder) {
    return [new TextRun({ text, bold, size: 22 })];
  }
  // Split on [PLACEHOLDER] patterns and highlight them
  const parts = text.split(/(\[[^\]]+\])/g);
  return parts.map((part) => {
    const isTag = /^\[[^\]]+\]$/.test(part);
    return new TextRun({
      text: part,
      bold: isTag ? true : bold,
      size: 22,
      shading: isTag
        ? { type: ShadingType.CLEAR, fill: AMBER_SHADING, color: AMBER_SHADING }
        : undefined,
    });
  });
}

function sectionToParagraphs(section: TemplateSection): Paragraph[] {
  const { tag, text, placeholder = false } = section;

  if (tag === "subject") {
    return [
      new Paragraph({
        spacing: { after: 80, before: 160 },
        shading: { type: ShadingType.CLEAR, fill: "E8F4FD", color: "E8F4FD" },
        border: {
          left: { style: BorderStyle.THICK, size: 12, color: "1E6FBB" },
        },
        indent: { left: convertInchesToTwip(0.2) },
        children: buildRuns(text, placeholder, true),
      }),
    ];
  }

  if (tag === "heading") {
    return [
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        spacing: { after: 120, before: 240 },
        alignment: AlignmentType.LEFT,
        children: [
          new TextRun({
            text,
            bold: true,
            size: 32,
            color: "1E3A5F",
          }),
        ],
      }),
    ];
  }

  if (tag === "subheading") {
    return [
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        spacing: { after: 80, before: 200 },
        children: [
          new TextRun({ text, bold: true, size: 24, color: "1E6FBB" }),
        ],
      }),
    ];
  }

  if (tag === "cta") {
    return [
      new Paragraph({
        spacing: { after: 80, before: 200 },
        shading: { type: ShadingType.CLEAR, fill: "EAF7EE", color: "EAF7EE" },
        border: {
          left: { style: BorderStyle.THICK, size: 12, color: "27AE60" },
        },
        indent: { left: convertInchesToTwip(0.2) },
        children: buildRuns(text, placeholder),
      }),
    ];
  }

  if (tag === "signature") {
    return [
      new Paragraph({
        spacing: { after: 60, before: 240 },
        border: {
          top: { style: BorderStyle.SINGLE, size: 6, color: "CCCCCC" },
        },
        children: [],
      }),
      ...text.split("\n").map(
        (line) =>
          new Paragraph({
            spacing: { after: 40 },
            children: buildRuns(line, placeholder, line.startsWith("[YOUR NAME")),
          })
      ),
    ];
  }

  if (tag === "ps") {
    return [
      new Paragraph({
        spacing: { after: 80, before: 120 },
        children: buildRuns(text, placeholder, false),
      }),
    ];
  }

  // tag === "body" — handle multiline bullet lists
  const lines = text.split("\n");
  return lines.map((line) => {
    const isBullet = line.startsWith("• ");
    return new Paragraph({
      bullet: isBullet ? { level: 0 } : undefined,
      spacing: { after: 80 },
      children: buildRuns(isBullet ? line.slice(2) : line, placeholder),
    });
  });
}

function buildLogoHeader(): Header {
  // Inline a small text-based "EdenRadar" header since we have no logo file
  return new Header({
    children: [
      new Paragraph({
        spacing: { after: 40 },
        border: {
          bottom: { style: BorderStyle.SINGLE, size: 6, color: "1E3A5F" },
        },
        children: [
          new TextRun({
            text: "EDEN",
            bold: true,
            size: 28,
            color: "1E3A5F",
          }),
          new TextRun({
            text: "RADAR",
            bold: true,
            size: 28,
            color: "27AE60",
          }),
          new TextRun({
            text: "  |  AI-Powered Biopharma Intelligence",
            size: 20,
            color: "666666",
          }),
        ],
      }),
    ],
  });
}

export async function generateTemplateDocx(template: EmailTemplate): Promise<Buffer> {
  const allParagraphs: Paragraph[] = [];

  for (const section of template.sections) {
    const paras = sectionToParagraphs(section);
    allParagraphs.push(...paras);
  }

  // Audience note at top
  const audienceNote = new Paragraph({
    spacing: { after: 80, before: 80 },
    shading: { type: ShadingType.CLEAR, fill: "F5F5F5", color: "F5F5F5" },
    children: [
      new TextRun({ text: "Audience: ", bold: true, size: 18, color: "888888" }),
      new TextRun({ text: template.audience, size: 18, color: "888888" }),
    ],
  });

  const placeholderNote = new Paragraph({
    spacing: { after: 160 },
    shading: { type: ShadingType.CLEAR, fill: AMBER_SHADING, color: AMBER_SHADING },
    children: [
      new TextRun({
        text: "Fields highlighted in amber are placeholders — replace before sending.",
        italics: true,
        size: 18,
        color: "7D5A0C",
      }),
    ],
  });

  const doc = new Document({
    sections: [
      {
        headers: { default: buildLogoHeader() },
        properties: {
          page: {
            margin: {
              top: convertInchesToTwip(1),
              bottom: convertInchesToTwip(1),
              left: convertInchesToTwip(1.25),
              right: convertInchesToTwip(1.25),
            },
          },
        },
        children: [audienceNote, placeholderNote, ...allParagraphs],
      },
    ],
    styles: {
      default: {
        document: {
          run: { font: "Calibri", size: 22, color: "1A1A1A" },
          paragraph: { spacing: { line: 276 } },
        },
      },
    },
  });

  return Packer.toBuffer(doc);
}
