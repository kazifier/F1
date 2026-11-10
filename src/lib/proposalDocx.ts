// ---------------------------------------------------------------------------
// Word export — a real .docx (WordprocessingML in a zip), not an HTML file
// renamed to .doc, so the offer opens cleanly in Word, LibreOffice and Google
// Docs. The whole document comes from the renderer-independent model in
// proposal.ts, so the Word and PDF offers cannot drift apart.
// ---------------------------------------------------------------------------
import JSZip from "jszip";
import type { DocSection, DocTable, ProposalDoc } from "./proposal";
import { proposalFileName } from "./proposal";

const ACCENT = "8B1E1E";
const INK = "222222";
const MUTED = "5B6572";
const RULE = "C9CFD6";

const PAGE_W = 11906; // A4 twips
const PAGE_H = 16838;
const MARGIN = 1134; // 2 cm
const USABLE = PAGE_W - MARGIN * 2;

const esc = (s: string) =>
  (s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

interface ParaOpts {
  bold?: boolean;
  italic?: boolean;
  size?: number; // pt
  color?: string;
  align?: "left" | "center" | "right" | "justify";
  after?: number; // twips
  before?: number;
  indent?: number;
  hanging?: number;
  rule?: boolean;
  keepNext?: boolean;
  pageBreakBefore?: boolean;
}

function run(text: string, o: ParaOpts = {}): string {
  const sz = Math.round((o.size ?? 10) * 2);
  const rPr =
    `<w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>` +
    `<w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/>` +
    (o.bold ? "<w:b/>" : "") +
    (o.italic ? "<w:i/>" : "") +
    `<w:color w:val="${o.color ?? INK}"/></w:rPr>`;
  const pieces = String(text ?? "").split("\n");
  return pieces
    .map((line, i) => `<w:r>${rPr}${i > 0 ? "<w:br/>" : ""}<w:t xml:space="preserve">${esc(line)}</w:t></w:r>`)
    .join("");
}

function para(text: string, o: ParaOpts = {}): string {
  const jc = o.align === "center" ? "center" : o.align === "right" ? "right" : o.align === "justify" ? "both" : "left";
  const pPr =
    `<w:pPr>` +
    (o.keepNext ? "<w:keepNext/>" : "") +
    (o.pageBreakBefore ? '<w:pageBreakBefore/>' : "") +
    `<w:spacing w:before="${o.before ?? 0}" w:after="${o.after ?? 80}" w:line="264" w:lineRule="auto"/>` +
    (o.indent ? `<w:ind w:left="${o.indent}"${o.hanging ? ` w:hanging="${o.hanging}"` : ""}/>` : "") +
    `<w:jc w:val="${jc}"/>` +
    (o.rule ? `<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="2" w:color="${RULE}"/></w:pBdr>` : "") +
    `</w:pPr>`;
  return `<w:p>${pPr}${run(text, o)}</w:p>`;
}

function cell(text: string, width: number, o: { bold?: boolean; shade?: string; align?: string; size?: number }): string {
  const jc = o.align === "right" ? "right" : o.align === "center" ? "center" : "left";
  const pPr = `<w:pPr><w:spacing w:before="20" w:after="20" w:line="240" w:lineRule="auto"/><w:jc w:val="${jc}"/></w:pPr>`;
  const rPr =
    `<w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="${Math.round((o.size ?? 8.5) * 2)}"/>` +
    (o.bold ? "<w:b/>" : "") +
    `<w:color w:val="${INK}"/></w:rPr>`;
  return (
    `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>` +
    (o.shade ? `<w:shd w:val="clear" w:color="auto" w:fill="${o.shade}"/>` : "") +
    `<w:tcMar><w:top w:w="40" w:type="dxa"/><w:left w:w="70" w:type="dxa"/><w:bottom w:w="40" w:type="dxa"/><w:right w:w="70" w:type="dxa"/></w:tcMar>` +
    `</w:tcPr><w:p>${pPr}<w:r>${rPr}<w:t xml:space="preserve">${esc(text)}</w:t></w:r></w:p></w:tc>`
  );
}

function tableXml(t: DocTable): string {
  const weights = t.widths ?? t.head.map(() => 1);
  const total = weights.reduce((a, b) => a + b, 0);
  const cols = weights.map((w) => Math.round((w / total) * USABLE));
  const grid = cols.map((c) => `<w:gridCol w:w="${c}"/>`).join("");
  const border = (side: string) => `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="${RULE}"/>`;
  const borders = `<w:tblBorders>${["top", "left", "bottom", "right", "insideH", "insideV"].map(border).join("")}</w:tblBorders>`;

  const header = `<w:tr><w:trPr><w:tblHeader/><w:cantSplit/></w:trPr>${t.head
    .map((h, i) => cell(h, cols[i], { bold: true, shade: "E4E9EF", align: t.align?.[i], size: 8.5 }))
    .join("")}</w:tr>`;

  const body = t.rows
    .map((row, r) => {
      const shade = r === t.rows.length - 1 && t.rows.length > 1 ? "F7F8FA" : undefined;
      return `<w:tr><w:trPr><w:cantSplit/></w:trPr>${row
        .map((c, i) => cell(c, cols[i], { align: t.align?.[i], shade }))
        .join("")}</w:tr>`;
    })
    .join("");

  return (
    `<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="${USABLE}" w:type="dxa"/>` +
    `<w:tblLayout w:type="fixed"/>${borders}</w:tblPr><w:tblGrid>${grid}</w:tblGrid>${header}${body}</w:tbl>` +
    para("", { after: 60, size: 2 })
  );
}

function heading(section: DocSection): string {
  return (
    `<w:p><w:pPr><w:keepNext/><w:spacing w:before="260" w:after="90" w:line="264" w:lineRule="auto"/>` +
    `<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="2" w:color="E2C6C6"/></w:pBdr></w:pPr>` +
    `<w:r><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:b/><w:sz w:val="22"/><w:color w:val="${ACCENT}"/></w:rPr>` +
    `<w:t xml:space="preserve">${esc(`${section.no}. ${section.title}`)}</w:t></w:r></w:p>`
  );
}

function sectionXml(section: DocSection): string {
  const out: string[] = [heading(section)];
  for (const p of section.paragraphs ?? []) out.push(para(p, { size: 10, align: "justify", after: 100 }));
  for (const b of section.bullets ?? []) out.push(para(`•  ${b}`, { size: 10, align: "justify", indent: 300, hanging: 200, after: 70 }));
  for (const sub of section.subsections ?? []) {
    out.push(para(sub.title, { bold: true, size: 10, color: ACCENT, before: 140, after: 60, keepNext: true }));
    for (const p of sub.paragraphs ?? []) out.push(para(p, { size: 10, align: "justify", indent: 220, after: 70 }));
    for (const b of sub.bullets ?? [])
      out.push(para(`•  ${b}`, { size: 10, align: "justify", indent: 460, hanging: 200, after: 60 }));
  }
  if (section.table) out.push(tableXml(section.table));
  if (section.note) out.push(para(section.note, { italic: true, size: 8.5, color: MUTED, after: 100 }));
  return out.join("");
}

function metaTable(doc: ProposalDoc): string {
  return tableXml({
    head: ["Offer", "Detail"],
    widths: [1.2, 4],
    rows: doc.meta.map((m) => [m.label, m.value]),
  });
}

function buildDocument(doc: ProposalDoc): string {
  const out: string[] = [];

  // ---- cover letter ---------------------------------------------------------
  out.push(para(doc.title, { bold: true, size: 18, color: ACCENT, align: "center", after: 60 }));
  out.push(para(doc.subtitle, { size: 9, color: MUTED, align: "center", after: 120, rule: true }));
  out.push(para(doc.attention, { bold: true, size: 10, before: 220, after: 60 }));
  out.push(para("Dear Sir,", { size: 10, after: 140 }));
  for (const p of doc.intro) out.push(para(p, { size: 10, align: "justify", after: 120 }));
  out.push(para("", { after: 60 }));
  for (const c of doc.closing) out.push(para(c, { size: 10, after: c.endsWith("faithfully,") ? 520 : 60 }));
  doc.signature.forEach((line, i) => out.push(para(line, { size: 10, bold: i === 0, after: i === 0 ? 20 : 20 })));

  // ---- proposal body --------------------------------------------------------
  out.push(
    para(doc.offerType === "Techno-Commercial" ? "TECHNO - COMMERCIAL PROPOSAL" : `${doc.offerType.toUpperCase()} PROPOSAL`, {
      bold: true,
      size: 15,
      color: ACCENT,
      align: "center",
      before: 400,
      after: 160,
      pageBreakBefore: true,
    }),
  );
  out.push(metaTable(doc));
  for (const section of doc.sections) out.push(sectionXml(section));

  out.push(
    para(
      "This offer is issued for review and acceptance. All calculations are estimating-grade until the fabrication drawings are approved.",
      { italic: true, size: 8, color: MUTED, before: 320, rule: true },
    ),
  );

  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
    `<w:body>${out.join("")}` +
    `<w:sectPr><w:pgSz w:w="${PAGE_W}" w:h="${PAGE_H}"/>` +
    `<w:pgMar w:top="${MARGIN}" w:right="${MARGIN}" w:bottom="${MARGIN}" w:left="${MARGIN}" w:header="720" w:footer="720" w:gutter="0"/>` +
    `</w:sectPr></w:body></w:document>`
  );
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const DOC_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults>
<w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:rPrDefault>
<w:pPrDefault><w:pPr><w:spacing w:after="80" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault>
</w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
<w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/><w:basedOn w:val="TableNormal"/><w:tblPr><w:tblBorders>
<w:top w:val="single" w:sz="4" w:space="0" w:color="${RULE}"/><w:left w:val="single" w:sz="4" w:space="0" w:color="${RULE}"/>
<w:bottom w:val="single" w:sz="4" w:space="0" w:color="${RULE}"/><w:right w:val="single" w:sz="4" w:space="0" w:color="${RULE}"/>
<w:insideH w:val="single" w:sz="4" w:space="0" w:color="${RULE}"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="${RULE}"/>
</w:tblBorders></w:tblPr></w:style>
</w:styles>`;

const saveBlob = (blob: Blob, name: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
};

export async function exportProposalDocx(doc: ProposalDoc): Promise<void> {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", CONTENT_TYPES);
  zip.file("_rels/.rels", ROOT_RELS);
  zip.file("word/document.xml", buildDocument(doc));
  zip.file("word/_rels/document.xml.rels", DOC_RELS);
  zip.file("word/styles.xml", STYLES);
  const blob = await zip.generateAsync({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    compression: "DEFLATE",
  });
  saveBlob(blob, proposalFileName(doc, "docx"));
}
