// ---------------------------------------------------------------------------
// PDF export — same document model as the Word offer, laid out on A4 with
// jsPDF. Tables, headings and the cover letter follow the Word version so the
// client receives the same offer in either format.
// ---------------------------------------------------------------------------
import { jsPDF } from "jspdf";
import type { DocSection, DocTable, ProposalDoc } from "./proposal";
import { proposalFileName } from "./proposal";

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 46;
const BOTTOM = 58;
const WIDTH = PAGE_W - MARGIN * 2;

type Rgb = [number, number, number];
const ACCENT: Rgb = [139, 30, 30];
const INK: Rgb = [34, 34, 34];
const MUTED: Rgb = [91, 101, 114];
const RULE: Rgb = [201, 207, 214];
const HEAD_FILL: Rgb = [228, 233, 239];
const TOTAL_FILL: Rgb = [247, 248, 250];

export function exportProposalPdf(offer: ProposalDoc): void {
  const pdf = new jsPDF({ unit: "pt", format: "a4", compress: true });
  let y = MARGIN;

  const space = (h: number) => {
    if (y + h > PAGE_H - BOTTOM) {
      pdf.addPage();
      y = MARGIN;
    }
  };

  const text = (
    value: string,
    o: {
      size?: number;
      bold?: boolean;
      italic?: boolean;
      color?: Rgb;
      align?: "left" | "center" | "right";
      indent?: number;
      after?: number;
      lead?: number;
      width?: number;
    } = {},
  ) => {
    const size = o.size ?? 9.5;
    const lead = o.lead ?? size * 1.45;
    const indent = o.indent ?? 0;
    const width = o.width ?? WIDTH - indent;
    pdf.setFont("helvetica", o.bold ? "bold" : o.italic ? "italic" : "normal");
    pdf.setFontSize(size);
    pdf.setTextColor(...(o.color ?? INK));
    const lines = pdf.splitTextToSize(value || " ", width) as string[];
    for (const line of lines) {
      space(lead);
      const x =
        o.align === "center" ? MARGIN + WIDTH / 2 : o.align === "right" ? PAGE_W - MARGIN : MARGIN + indent;
      pdf.text(line, x, y + size, { align: o.align ?? "left" });
      y += lead;
    }
    y += o.after ?? 0;
  };

  const rule = () => {
    space(8);
    pdf.setDrawColor(...RULE);
    pdf.setLineWidth(0.6);
    pdf.line(MARGIN, y, PAGE_W - MARGIN, y);
    y += 8;
  };

  const drawTable = (t: DocTable) => {
    const weights = t.widths ?? t.head.map(() => 1);
    const total = weights.reduce((a, b) => a + b, 0);
    const cols = weights.map((w) => (w / total) * WIDTH);
    const pad = 4;
    const size = 7.6;
    const lead = size * 1.32;

    const rowHeight = (cells: string[], bold: boolean) => {
      pdf.setFont("helvetica", bold ? "bold" : "normal");
      pdf.setFontSize(size);
      const lines = Math.max(...cells.map((c, i) => (pdf.splitTextToSize(c || " ", cols[i] - pad * 2) as string[]).length));
      return lines * lead + pad * 1.6;
    };

    const drawRow = (cells: string[], bold: boolean, fill?: Rgb) => {
      const h = rowHeight(cells, bold);
      space(h);
      let x = MARGIN;
      pdf.setFont("helvetica", bold ? "bold" : "normal");
      pdf.setFontSize(size);
      cells.forEach((c, i) => {
        if (fill) {
          pdf.setFillColor(...fill);
          pdf.rect(x, y, cols[i], h, "F");
        }
        pdf.setDrawColor(...RULE);
        pdf.setLineWidth(0.5);
        pdf.rect(x, y, cols[i], h, "S");
        const lines = pdf.splitTextToSize(c || " ", cols[i] - pad * 2) as string[];
        pdf.setTextColor(...INK);
        const align = t.align?.[i] ?? "left";
        const tx = align === "right" ? x + cols[i] - pad : align === "center" ? x + cols[i] / 2 : x + pad;
        lines.slice(0, 4).forEach((line, li) => {
          pdf.text(line, tx, y + pad + size + li * lead, { align });
        });
        x += cols[i];
      });
      y += h;
    };

    drawRow(t.head, true, HEAD_FILL);
    t.rows.forEach((row, i) => drawRow(row, false, i === t.rows.length - 1 && t.rows.length > 1 ? TOTAL_FILL : undefined));
    y += 6;
  };

  const drawSection = (section: DocSection) => {
    space(40);
    y += 8;
    text(`${section.no}. ${section.title}`, { size: 11, bold: true, color: ACCENT, after: 2 });
    rule();
    for (const p of section.paragraphs ?? []) text(p, { size: 9.5, after: 4 });
    for (const b of section.bullets ?? []) text(`•  ${b}`, { size: 9.5, indent: 10, after: 2 });
    for (const sub of section.subsections ?? []) {
      y += 3;
      text(sub.title, { size: 9.5, bold: true, color: ACCENT, after: 2 });
      for (const p of sub.paragraphs ?? []) text(p, { size: 9.5, indent: 10, after: 3 });
      for (const b of sub.bullets ?? []) text(`•  ${b}`, { size: 9.5, indent: 18, after: 2 });
    }
    if (section.table) drawTable(section.table);
    if (section.note) text(section.note, { size: 8, italic: true, color: MUTED, after: 4 });
  };

  // ---- cover letter ---------------------------------------------------------
  text(offer.title, { size: 17, bold: true, color: ACCENT, align: "center", after: 2 });
  text(offer.subtitle, { size: 9, color: MUTED, align: "center", after: 6 });
  rule();
  y += 10;
  text(offer.attention, { size: 9.5, bold: true, after: 6 });
  text("Dear Sir,", { size: 9.5, after: 8 });
  for (const p of offer.intro) text(p, { size: 9.5, after: 6 });
  y += 6;
  for (const c of offer.closing) text(c, { size: 9.5, after: c.endsWith("faithfully,") ? 26 : 2 });
  offer.signature.forEach((line, i) => text(line, { size: 9.5, bold: i === 0, after: 1 }));

  // ---- proposal body --------------------------------------------------------
  pdf.addPage();
  y = MARGIN;
  text(
    offer.offerType === "Techno-Commercial" ? "TECHNO - COMMERCIAL PROPOSAL" : `${offer.offerType.toUpperCase()} PROPOSAL`,
    { size: 15, bold: true, color: ACCENT, align: "center", after: 10 },
  );
  drawTable({
    head: ["Offer", "Detail"],
    widths: [1.2, 4],
    rows: offer.meta.map((m) => [m.label, m.value]),
  });
  for (const section of offer.sections) drawSection(section);

  y += 8;
  rule();
  text(
    "This offer is issued for review and acceptance. All calculations are estimating-grade until the fabrication drawings are approved.",
    { size: 7.5, italic: true, color: MUTED },
  );

  // ---- page numbers ---------------------------------------------------------
  const pages = pdf.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    pdf.setPage(i);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7.5);
    pdf.setTextColor(...MUTED);
    pdf.text(`${offer.offerNo} Rev. ${offer.revision}`, MARGIN, PAGE_H - 26);
    pdf.text(`Page ${i} of ${pages}`, PAGE_W - MARGIN, PAGE_H - 26, { align: "right" });
  }

  pdf.save(proposalFileName(offer, "pdf"));
}
