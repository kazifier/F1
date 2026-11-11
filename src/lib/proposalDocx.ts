// ---------------------------------------------------------------------------
// Word export — a real .docx (WordprocessingML in a zip), not an HTML file
// renamed to .doc, so the offer opens cleanly in Word, LibreOffice and Google
// Docs. The whole document comes from the renderer-independent model in
// proposal.ts, so the Word and PDF offers cannot drift apart.
//
// Presentation follows the house offer: letterhead on every page, accent title
// band, an offer-at-a-glance strip, the parties block, section headings with a
// numbered accent bar and tables with a dark header, zebra rows and an
// emphasised total.
// ---------------------------------------------------------------------------
import JSZip from "jszip";
import type { DocSection, DocTable, ProposalDoc } from "./proposal";
import { proposalFileName } from "./proposal";

const ACCENT = "8B1E1E";
const ACCENT_SOFT = "F6EDED";
const CARD = "F7F5F5";
const ZEBRA = "FBF9F9";
const INK = "1F2328";
const MUTED = "667080";
const RULE = "E6DCDC";
const RULE_DARK = "CFC0C0";
const WHITE = "FFFFFF";

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

interface RunOpts {
  bold?: boolean;
  italic?: boolean;
  size?: number; // pt
  color?: string;
  caps?: boolean;
  tracking?: number;
}

interface ParaOpts extends RunOpts {
  align?: "left" | "center" | "right" | "justify";
  after?: number; // twips
  before?: number;
  indent?: number;
  hanging?: number;
  shade?: string;
  /** accent bar down the left edge (section headings) */
  bar?: boolean;
  /** hairline under the paragraph */
  rule?: boolean;
  keepNext?: boolean;
  pageBreakBefore?: boolean;
}

function run(text: string, o: RunOpts = {}): string {
  const sz = Math.round((o.size ?? 10) * 2);
  const rPr =
    `<w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>` +
    `<w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/>` +
    (o.bold ? "<w:b/>" : "") +
    (o.italic ? "<w:i/>" : "") +
    (o.caps ? "<w:caps/>" : "") +
    (o.tracking ? `<w:spacing w:val="${o.tracking}"/>` : "") +
    `<w:color w:val="${o.color ?? INK}"/></w:rPr>`;
  return String(text ?? "")
    .split("\n")
    .map((line, i) => `<w:r>${rPr}${i > 0 ? "<w:br/>" : ""}<w:t xml:space="preserve">${esc(line)}</w:t></w:r>`)
    .join("");
}

function para(text: string, o: ParaOpts = {}): string {
  const jc = o.align === "center" ? "center" : o.align === "right" ? "right" : o.align === "justify" ? "both" : "left";
  const border =
    o.bar || o.rule
      ? `<w:pBdr>${o.bar ? `<w:left w:val="single" w:sz="18" w:space="10" w:color="${ACCENT}"/>` : ""}${
          o.rule ? `<w:bottom w:val="single" w:sz="4" w:space="4" w:color="${RULE}"/>` : ""
        }</w:pBdr>`
      : "";
  const pPr =
    `<w:pPr>` +
    (o.keepNext ? "<w:keepNext/>" : "") +
    (o.pageBreakBefore ? '<w:pageBreakBefore/>' : "") +
    border +
    (o.shade ? `<w:shd w:val="clear" w:color="auto" w:fill="${o.shade}"/>` : "") +
    `<w:spacing w:before="${o.before ?? 0}" w:after="${o.after ?? 90}" w:line="264" w:lineRule="auto"/>` +
    (o.indent ? `<w:ind w:left="${o.indent}"${o.hanging ? ` w:hanging="${o.hanging}"` : ""}/>` : "") +
    `<w:jc w:val="${jc}"/>` +
    `</w:pPr>`;
  return `<w:p>${pPr}${run(text, o)}</w:p>`;
}

interface Block {
  text: string;
  bold?: boolean;
  size?: number;
  color?: string;
  caps?: boolean;
  tracking?: number;
  after?: number;
}

function cellBlocks(blocks: Block[], width: number, o: { shade?: string; align?: string; borders?: string } = {}): string {
  const inner = blocks
    .map((b) =>
      `<w:p><w:pPr><w:spacing w:before="0" w:after="${b.after ?? 20}" w:line="240" w:lineRule="auto"/><w:jc w:val="${
        o.align === "right" ? "right" : o.align === "center" ? "center" : "left"
      }"/></w:pPr>${run(b.text, {
        bold: b.bold,
        size: b.size ?? 8.5,
        color: b.color,
        caps: b.caps,
        tracking: b.tracking,
      })}</w:p>`,
    )
    .join("");
  return (
    `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>` +
    (o.borders ?? "") +
    `<w:vAlign w:val="center"/>` +
    (o.shade ? `<w:shd w:val="clear" w:color="auto" w:fill="${o.shade}"/>` : "") +
    `<w:tcMar><w:top w:w="80" w:type="dxa"/><w:left w:w="100" w:type="dxa"/><w:bottom w:w="80" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tcMar>` +
    `</w:tcPr>${inner}</w:tc>`
  );
}

function tableXml(t: DocTable, o: { striped?: boolean; emphasisLast?: boolean } = {}): string {
  const weights = t.widths ?? t.head.map(() => 1);
  const total = weights.reduce((a, b) => a + b, 0);
  const cols = weights.map((w) => Math.round((w / total) * USABLE));
  const grid = cols.map((c) => `<w:gridCol w:w="${c}"/>`).join("");
  const border = (side: string) => `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="${RULE}"/>`;
  const borders = `<w:tblBorders>${["top", "left", "bottom", "right", "insideH", "insideV"].map(border).join("")}</w:tblBorders>`;

  const head = t.head.length
    ? `<w:tr><w:trPr><w:tblHeader/><w:cantSplit/></w:trPr>${t.head
        .map((h, i) =>
          cellBlocks([{ text: h, bold: true, size: 8.5, color: WHITE, after: 0 }], cols[i], {
            shade: ACCENT,
            align: t.align?.[i],
            borders: `<w:tcBorders><w:top w:val="single" w:sz="4" w:color="${ACCENT}"/><w:left w:val="single" w:sz="4" w:color="${ACCENT}"/><w:bottom w:val="single" w:sz="4" w:color="${ACCENT}"/><w:right w:val="single" w:sz="4" w:color="${ACCENT}"/></w:tcBorders>`,
          }),
        )
        .join("")}</w:tr>`
    : "";

  // a full-width band row introduces each block of the table
  const bandRow = (title: string) =>
    `<w:tr><w:trPr><w:cantSplit/></w:trPr><w:tc><w:tcPr><w:tcW w:w="${USABLE}" w:type="dxa"/><w:gridSpan w:val="${t.head.length || 1}"/><w:shd w:val="clear" w:color="auto" w:fill="${ACCENT_SOFT}"/><w:tcBorders>${["top", "left", "bottom", "right"]
      .map((s) => `<w:${s} w:val="single" w:sz="4" w:color="${RULE}"/>`)
      .join("")}</w:tcBorders><w:tcMar><w:top w:w="70" w:type="dxa"/><w:left w:w="100" w:type="dxa"/><w:bottom w:w="70" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tcMar></w:tcPr>` +
    `<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/></w:pPr>${run(title, { bold: true, size: 8.5, color: ACCENT, caps: true, tracking: 20 })}</w:p></w:tc></w:tr>`;

  const lastIndex = t.rows.length - 1;
  const body = t.rows
    .map((row, r) => {
      const band = t.bands?.find((b) => b.before === r);
      const totalRow = o.emphasisLast && r === lastIndex;
      const shade = totalRow ? ACCENT_SOFT : o.striped && r % 2 === 1 ? ZEBRA : undefined;
      return `${band ? bandRow(band.title) : ""}<w:tr><w:trPr><w:cantSplit/></w:trPr>${row
        .map((c, i) => {
          const sub = t.sub?.[r]?.[i];
          const blocks: Block[] = [
            { text: c, bold: totalRow, size: totalRow ? 9 : 8.5, color: totalRow ? ACCENT : INK, after: sub ? 26 : 0 },
          ];
          if (sub) blocks.push({ text: sub, size: 7, color: MUTED, after: 0 });
          return cellBlocks(blocks, cols[i], {
            shade,
            align: t.align?.[i],
            borders: totalRow
              ? `<w:tcBorders><w:top w:val="single" w:sz="8" w:color="${RULE_DARK}"/><w:bottom w:val="single" w:sz="4" w:color="${RULE}"/><w:left w:val="single" w:sz="4" w:color="${RULE}"/><w:right w:val="single" w:sz="4" w:color="${RULE}"/></w:tcBorders>`
              : undefined,
          });
        })
        .join("")}</w:tr>`;
    })
    .join("");

  return (
    `<w:tbl><w:tblPr><w:tblW w:w="${USABLE}" w:type="dxa"/><w:tblLayout w:type="fixed"/>${borders}</w:tblPr>` +
    `<w:tblGrid>${grid}</w:tblGrid>${head}${body}</w:tbl>` +
    para("", { after: 140, size: 2 })
  );
}

/** three-across strip of label + value cards */
function statStrip(stats: { label: string; value: string }[]): string {
  const w = Math.round(USABLE / stats.length);
  const cells = stats
    .map((s) =>
      cellBlocks(
        [
          { text: s.label, size: 7.5, color: MUTED, caps: true, tracking: 20, after: 30 },
          { text: s.value, size: 12, bold: true, color: ACCENT, after: 0 },
        ],
        w,
        {
          shade: CARD,
          borders: `<w:tcBorders><w:top w:val="single" w:sz="4" w:color="${RULE}"/><w:bottom w:val="single" w:sz="4" w:color="${RULE}"/><w:left w:val="single" w:sz="4" w:color="${RULE}"/><w:right w:val="single" w:sz="4" w:color="${RULE}"/></w:tcBorders>`,
        },
      ),
    )
    .join("");
  return (
    `<w:tbl><w:tblPr><w:tblW w:w="${USABLE}" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders>${[
      "top",
      "left",
      "bottom",
      "right",
      "insideH",
      "insideV",
    ]
      .map((s) => `<w:${s} w:val="single" w:sz="4" w:space="0" w:color="${RULE}"/>`)
      .join("")}</w:tblBorders></w:tblPr><w:tblGrid>${stats
      .map(() => `<w:gridCol w:w="${w}"/>`)
      .join("")}</w:tblGrid><w:tr><w:trPr><w:cantSplit/></w:trPr>${cells}</w:tr></w:tbl>` +
    para("", { after: 120, size: 2 })
  );
}

/** the dark title band at the top of the body page */
function titleBand(title: string, subtitle: string): string {
  return (
    `<w:tbl><w:tblPr><w:tblW w:w="${USABLE}" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders>${[
      "top",
      "left",
      "bottom",
      "right",
      "insideH",
      "insideV",
    ]
      .map((s) => `<w:${s} w:val="single" w:sz="4" w:space="0" w:color="${ACCENT}"/>`)
      .join("")}</w:tblBorders></w:tblPr><w:tblGrid><w:gridCol w:w="${USABLE}"/></w:tblGrid>` +
    `<w:tr><w:trPr><w:cantSplit/></w:trPr>${cellBlocks(
      [
        { text: title, size: 17, bold: true, color: WHITE, caps: true, tracking: 20, after: 40 },
        { text: subtitle, size: 9, color: "F3DCDC", after: 0 },
      ],
      USABLE,
      { shade: ACCENT },
    )}</w:tr></w:tbl>` +
    para("", { after: 180, size: 2 })
  );
}

function heading(section: DocSection): string {
  return (
    `<w:p><w:pPr><w:keepNext/><w:pBdr>` +
    `<w:left w:val="single" w:sz="18" w:space="10" w:color="${ACCENT}"/>` +
    `<w:bottom w:val="single" w:sz="4" w:space="4" w:color="${RULE}"/>` +
    `</w:pBdr><w:spacing w:before="320" w:after="120" w:line="264" w:lineRule="auto"/><w:ind w:left="170"/></w:pPr>` +
    `<w:r><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:b/><w:sz w:val="24"/><w:color w:val="${ACCENT}"/></w:rPr>` +
    `<w:t xml:space="preserve">${esc(`${section.no.padStart(2, "0")}  ${section.title}`)}</w:t></w:r></w:p>`
  );
}

function sectionXml(section: DocSection): string {
  const out: string[] = [heading(section)];
  for (const p of section.paragraphs ?? []) out.push(para(p, { size: 10, align: "justify", after: 120 }));
  for (const b of section.bullets ?? [])
    out.push(
      `<w:p><w:pPr><w:spacing w:before="0" w:after="70" w:line="264" w:lineRule="auto"/><w:ind w:left="320" w:hanging="200"/><w:jc w:val="both"/></w:pPr>` +
        `<w:r><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="20"/><w:color w:val="${ACCENT}"/></w:rPr><w:t xml:space="preserve">▪ </w:t></w:r>` +
        `${run(b, { size: 10 })}</w:p>`,
    );
  for (const sub of section.subsections ?? []) {
    out.push(para(sub.title, { bold: true, size: 10.5, color: ACCENT, before: 160, after: 70, keepNext: true }));
    for (const p of sub.paragraphs ?? []) out.push(para(p, { size: 10, align: "justify", indent: 240, after: 70 }));
    for (const b of sub.bullets ?? [])
      out.push(
        `<w:p><w:pPr><w:spacing w:before="0" w:after="60" w:line="264" w:lineRule="auto"/><w:ind w:left="560" w:hanging="200"/><w:jc w:val="both"/></w:pPr>` +
          `<w:r><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="20"/><w:color w:val="${ACCENT}"/></w:rPr><w:t xml:space="preserve">▪ </w:t></w:r>` +
          `${run(b, { size: 10 })}</w:p>`,
      );
  }
  if (section.table)
    out.push(tableXml(section.table, { striped: true, emphasisLast: !!section.table.emphasiseLast }));
  if (section.note) out.push(para(section.note, { italic: true, size: 8.5, color: MUTED, after: 120 }));
  return out.join("");
}

function buildDocument(doc: ProposalDoc): string {
  const out: string[] = [];

  // ---- cover letter ---------------------------------------------------------
  out.push(titleBand(doc.title, `${doc.offerNo}  ·  Rev. ${doc.revision}  ·  ${doc.dateLabel}`));

  const partyWidth = Math.round(USABLE / 3);
  const partyCell = (label: string, value: string, detail?: string) =>
    cellBlocks(
      [
        { text: label, size: 7.5, color: MUTED, caps: true, tracking: 20, after: 40 },
        { text: value || "—", size: 10, bold: true, color: INK, after: detail ? 20 : 0 },
        ...(detail ? [{ text: detail, size: 8, color: MUTED, after: 0 }] : []),
      ],
      partyWidth,
      {
        borders: `<w:tcBorders><w:top w:val="single" w:sz="4" w:color="${RULE}"/><w:bottom w:val="single" w:sz="4" w:color="${RULE}"/><w:left w:val="single" w:sz="4" w:color="${RULE}"/><w:right w:val="single" w:sz="4" w:color="${RULE}"/></w:tcBorders>`,
      },
    );

  out.push(
    `<w:tbl><w:tblPr><w:tblW w:w="${USABLE}" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders>${[
      "top",
      "left",
      "bottom",
      "right",
      "insideH",
      "insideV",
    ]
      .map((s) => `<w:${s} w:val="single" w:sz="4" w:space="0" w:color="${RULE}"/>`)
      .join("")}</w:tblBorders></w:tblPr><w:tblGrid>${[0, 1, 2]
      .map(() => `<w:gridCol w:w="${partyWidth}"/>`)
      .join("")}</w:tblGrid><w:tr><w:trPr><w:cantSplit/></w:trPr>${partyCell(
      "End user",
      doc.endUser,
      "Plant owner / installation site",
    )}${partyCell("Client (EPC)", doc.client, doc.clientAddress || "Issues the purchase order")}${partyCell(
      "Ramsis Engineering",
      "Sitra, Kingdom of Bahrain",
      "Design · fabrication · supply",
    )}</w:tr></w:tbl>` + para("", { after: 160, size: 2 }),
  );

  out.push(
    statStrip([
      {
        label: "Quoted value",
        value: doc.priced ? `${doc.currency.code} ${Math.round(doc.totals.grand).toLocaleString("en-US")}` : "Unpriced",
      },
      { label: "Delivery", value: `${doc.deliveryWeeks} weeks` },
      { label: "Validity", value: `${doc.validityDays} days` },
    ]),
  );

  out.push(para(doc.attention, { bold: true, size: 10, before: 200, after: 70 }));
  out.push(para("Dear Sir,", { size: 10, after: 140 }));
  for (const p of doc.intro) out.push(para(p, { size: 10, align: "justify", after: 120 }));
  out.push(para("", { after: 60 }));
  for (const c of doc.closing) out.push(para(c, { size: 10, after: c.endsWith("faithfully,") ? 480 : 70 }));

  doc.signature.forEach((line, i) =>
    out.push(
      para(line, {
        size: i === 0 ? 10.5 : 9.5,
        bold: i === 0,
        color: i === 0 ? ACCENT : i === 1 ? MUTED : INK,
        after: 20,
      }),
    ),
  );

  // ---- proposal body --------------------------------------------------------
  out.push(
    para(
      doc.offerType === "Techno-Commercial" ? "TECHNO - COMMERCIAL PROPOSAL" : `${doc.offerType.toUpperCase()} PROPOSAL`,
      { bold: true, size: 18, color: ACCENT, before: 420, after: 40, pageBreakBefore: true, caps: true, tracking: 40 },
    ),
  );
  out.push(para("Scope, technical terms and commercial conditions", { size: 9, color: MUTED, after: 220, rule: true }));

  // offer register — label / value pairs
  out.push(
    tableXml(
      { head: [], widths: [1.6, 4.2], align: ["left", "left"], rows: doc.meta.map((m) => [m.label, m.value]) },
      { striped: true },
    ),
  );

  for (const section of doc.sections) out.push(sectionXml(section));

  out.push(
    para(
      "This offer is issued for review and acceptance. All calculations are estimating-grade until the fabrication drawings are approved.",
      { italic: true, size: 8, color: MUTED, before: 320, rule: true },
    ),
  );

  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<w:body>${out.join("")}` +
    `<w:sectPr>` +
    `<w:headerReference w:type="default" r:id="rIdHeader"/>` +
    `<w:footerReference w:type="default" r:id="rIdFooter"/>` +
    `<w:pgSz w:w="${PAGE_W}" w:h="${PAGE_H}"/>` +
    `<w:pgMar w:top="${MARGIN + 260}" w:right="${MARGIN}" w:bottom="${MARGIN + 260}" w:left="${MARGIN}" w:header="566" w:footer="566" w:gutter="0"/>` +
    `</w:sectPr></w:body></w:document>`
  );
}

function headerXml(doc: ProposalDoc): string {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
    `<w:p><w:pPr><w:tabs><w:tab w:val="right" w:pos="${USABLE}"/></w:tabs>` +
    `<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="6" w:color="${RULE}"/></w:pBdr>` +
    `<w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr>` +
    `${run("RAMSIS ENGINEERING", { size: 9, bold: true, color: ACCENT, caps: true, tracking: 40 })}` +
    `${run("\t", { size: 9 })}` +
    `${run(`${doc.offerNo}  ·  Rev. ${doc.revision}  ·  ${doc.dateLabel}`, { size: 8, color: MUTED })}` +
    `</w:p></w:hdr>`
  );
}

const pageField = (instr: string) =>
  `<w:r><w:fldChar w:fldCharType="begin"/></w:r>` +
  `<w:r><w:instrText xml:space="preserve">${instr}</w:instrText></w:r>` +
  `<w:r><w:fldChar w:fldCharType="separate"/></w:r>` +
  `<w:r><w:t>1</w:t></w:r>` +
  `<w:r><w:fldChar w:fldCharType="end"/></w:r>`;

function footerXml(doc: ProposalDoc): string {
  const rPr = `<w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="16"/><w:color w:val="${MUTED}"/></w:rPr>`;
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
    `<w:p><w:pPr><w:tabs><w:tab w:val="right" w:pos="${USABLE}"/></w:tabs>` +
    `<w:pBdr><w:top w:val="single" w:sz="4" w:space="6" w:color="${RULE}"/></w:pBdr>` +
    `<w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/></w:pPr>` +
    `<w:r>${rPr}<w:t xml:space="preserve">${esc(doc.subject.slice(0, 70))}</w:t></w:r>` +
    `<w:r>${rPr}<w:tab/><w:t xml:space="preserve">Page </w:t></w:r>` +
    pageField(" PAGE ") +
    `<w:r>${rPr}<w:t xml:space="preserve"> of </w:t></w:r>` +
    pageField(" NUMPAGES ") +
    `</w:p></w:ftr>`
  );
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>
<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>
</Types>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const DOC_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
<Relationship Id="rIdHeader" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>
<Relationship Id="rIdFooter" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>
</Relationships>`;

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults>
<w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:rPrDefault>
<w:pPrDefault><w:pPr><w:spacing w:after="90" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault>
</w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
<w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/><w:basedOn w:val="TableNormal"/></w:style>
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
  zip.file("word/header1.xml", headerXml(doc));
  zip.file("word/footer1.xml", footerXml(doc));
  const blob = await zip.generateAsync({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    compression: "DEFLATE",
  });
  saveBlob(blob, proposalFileName(doc, "docx"));
}
