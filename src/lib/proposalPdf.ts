// ---------------------------------------------------------------------------
// PDF export — same document model as the Word offer, laid out on A4 with
// jsPDF. Presentation matches the Word file: accent letterhead band, title
// panel, parties block, offer-at-a-glance strip, numbered section chips and
// tables with a dark header, zebra rows and an emphasised total.
// ---------------------------------------------------------------------------
import { jsPDF } from "jspdf";
import type { DocSection, DocTable, ProposalDoc } from "./proposal";
import { proposalFileName } from "./proposal";

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 46;
const WIDTH = PAGE_W - MARGIN * 2;
const TOP = 66;
const BOTTOM = 54;

type Rgb = [number, number, number];
const ACCENT: Rgb = [139, 30, 30];
const ACCENT_SOFT: Rgb = [246, 237, 237];
const CARD: Rgb = [247, 245, 245];
const INK: Rgb = [31, 35, 40];
const MUTED: Rgb = [102, 112, 128];
const RULE: Rgb = [230, 220, 220];
const ZEBRA: Rgb = [251, 249, 249];
const WHITE: Rgb = [255, 255, 255];

interface WriteOpts {
  size?: number;
  bold?: boolean;
  italic?: boolean;
  color?: Rgb;
  align?: "left" | "center" | "right";
  indent?: number;
  after?: number;
  lead?: number;
  charSpace?: number;
}

function renderProposalPdf(offer: ProposalDoc): jsPDF {
  const pdf = new jsPDF({ unit: "pt", format: "a4", compress: true });
  let y = 0;

  const newPage = () => {
    pdf.addPage();
    y = TOP;
  };
  const ensure = (h: number) => {
    if (y + h > PAGE_H - BOTTOM) newPage();
  };

  const write = (value: string, o: WriteOpts = {}) => {
    const size = o.size ?? 9.5;
    const lead = o.lead ?? size * 1.42;
    const indent = o.indent ?? 0;
    pdf.setCharSpace(o.charSpace ?? 0);
    pdf.setFont("helvetica", o.bold ? "bold" : o.italic ? "italic" : "normal");
    pdf.setFontSize(size);
    pdf.setTextColor(...(o.color ?? INK));
    const lines = pdf.splitTextToSize(value || " ", WIDTH - indent) as string[];
    lines.forEach((line) => {
      ensure(lead);
      const x =
        o.align === "center" ? MARGIN + WIDTH / 2 : o.align === "right" ? MARGIN + WIDTH : MARGIN + indent;
      pdf.text(line, x, y + size, { align: o.align ?? "left" });
      y += lead;
    });
    pdf.setCharSpace(0);
    y += o.after ?? 0;
  };

  const hairline = (color: Rgb = RULE, weight = 0.7) => {
    pdf.setDrawColor(...color);
    pdf.setLineWidth(weight);
    pdf.line(MARGIN, y, PAGE_W - MARGIN, y);
  };

  // ---- tables ---------------------------------------------------------------
  const table = (t: DocTable, opts: { emphasiseLast?: boolean } = {}) => {
    if (!t.head.length && !t.rows.length) return;
    const weights = t.widths ?? (t.rows[0] ?? t.head).map(() => 1);
    const total = weights.reduce((a, b) => a + b, 0);
    const cols = weights.map((w) => (w / total) * WIDTH);
    const padX = 5;
    const padY = 4.5;
    const size = 7.7;
    const lead = size * 1.32;
    const subSize = 6.9;
    const subLead = subSize * 1.32;
    const barH = 7;

    const linesIn = (cells: string[], bold: boolean) => {
      pdf.setFont("helvetica", bold ? "bold" : "normal");
      pdf.setFontSize(size);
      return cells.map((c, i) => pdf.splitTextToSize(c || " ", cols[i] - padX * 2) as string[]);
    };
    const subLinesIn = (r: number) => {
      const sub = t.sub?.[r];
      if (!sub) return null;
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(subSize);
      return sub.map((s, i) => (s ? (pdf.splitTextToSize(s, cols[i] - padX * 2) as string[]) : []));
    };
    const barOf = (r: number) => (t.barColumn !== undefined ? t.bars?.[r] : undefined);

    const rowHeight = (cells: string[], bold: boolean, r: number) => {
      const lines = linesIn(cells, bold);
      const sub = subLinesIn(r);
      const mainH = Math.max(...lines.map((l) => l.length)) * lead;
      const subH = sub ? Math.max(...sub.map((l) => l.length)) * subLead : 0;
      return mainH + subH + (barOf(r) ? barH + 4 : 0) + padY * 2;
    };

    const drawRow = (cells: string[], bold: boolean, fill?: Rgb, textColor: Rgb = INK, r = -1) => {
      const h = rowHeight(cells, bold, r);
      const lines = linesIn(cells, bold);
      const sub = subLinesIn(r);
      let x = MARGIN;
      cells.forEach((_, i) => {
        const cellX = x;
        if (fill) {
          pdf.setFillColor(...fill);
          pdf.rect(x, y, cols[i], h, "F");
        }
        pdf.setDrawColor(...RULE);
        pdf.setLineWidth(0.5);
        pdf.rect(x, y, cols[i], h, "S");

        const bar = barOf(r);
        if (i === t.barColumn && bar) {
          const total = t.barTotal ?? 1;
          const usable = cols[i] - padX * 2;
          pdf.setFillColor(...ACCENT);
          pdf.rect(cellX + padX + (bar.start / total) * usable, y + h / 2 - barH / 2, Math.max(2, (bar.days / total) * usable), barH, "F");
          x += cols[i];
          return;
        }

        pdf.setTextColor(...textColor);
        const align = t.align?.[i] ?? "left";
        const tx = align === "right" ? x + cols[i] - padX : align === "center" ? x + cols[i] / 2 : x + padX;
        lines[i].slice(0, 5).forEach((line, li) => {
          pdf.text(line, tx, y + padY + size + li * lead, { align });
        });
        if (sub?.[i]?.length) {
          pdf.setFont("helvetica", "normal");
          pdf.setFontSize(subSize);
          pdf.setTextColor(...MUTED);
          const subTop = y + padY + size + Math.max(lines[i].length, 1) * lead;
          sub[i].slice(0, 7).forEach((line, li) => {
            pdf.text(line, cellX + padX, subTop + li * subLead);
          });
          pdf.setFontSize(size);
        }
        x += cols[i];
      });
      y += h;
    };

    const drawHead = () => {
      if (!t.head.length) return;
      drawRow(t.head, true, ACCENT, WHITE);
    };

    drawHead();
    t.rows.forEach((row, i) => {
      const band = t.bands?.find((b) => b.before === i);
      if (band) {
        if (y + 35 > PAGE_H - BOTTOM) {
          newPage();
          drawHead();
        }
        pdf.setFillColor(...ACCENT_SOFT);
        pdf.rect(MARGIN, y, WIDTH, 17, "F");
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(7.2);
        pdf.setTextColor(...ACCENT);
        pdf.setCharSpace(0.9);
        pdf.text(band.title.toUpperCase(), MARGIN + 5, y + 11.4);
        pdf.setCharSpace(0);
        y += 17;
      }
      const isTotal = !!opts.emphasiseLast && i === t.rows.length - 1;
      const h = rowHeight(row, isTotal, i);
      if (y + h > PAGE_H - BOTTOM) {
        newPage();
        drawHead();
      }
      drawRow(row, isTotal, isTotal ? ACCENT_SOFT : i % 2 === 1 ? ZEBRA : undefined, isTotal ? ACCENT : INK, i);
    });
    y += 9;
  };

  // ---- sections -------------------------------------------------------------
  const section = (s: DocSection) => {
    ensure(120);
    y += 14;
    const chipW = 23;
    const chipH = 15;
    pdf.setFillColor(...ACCENT);
    pdf.rect(MARGIN, y, chipW, chipH, "F");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8);
    pdf.setTextColor(...WHITE);
    pdf.text(s.no.padStart(2, "0"), MARGIN + chipW / 2, y + chipH - 4.5, { align: "center" });

    pdf.setFontSize(11.5);
    pdf.setTextColor(...ACCENT);
    const titleLines = pdf.splitTextToSize(s.title, WIDTH - chipW - 10) as string[];
    titleLines.slice(0, 2).forEach((line, i) => pdf.text(line, MARGIN + chipW + 8, y + 11.5 + i * 12.5));
    y += Math.max(chipH, titleLines.slice(0, 2).length * 12.5) + 7;
    hairline();
    y += 10;

    for (const p of s.paragraphs ?? []) write(p, { size: 9.5, after: 5 });
    for (const b of s.bullets ?? []) write(`•   ${b}`, { size: 9.5, indent: 12, after: 2.5 });
    for (const sub of s.subsections ?? []) {
      y += 4;
      write(sub.title, { size: 9.6, bold: true, color: ACCENT, after: 2 });
      for (const p of sub.paragraphs ?? []) write(p, { size: 9.5, indent: 12, after: 3 });
      for (const b of sub.bullets ?? []) write(`•   ${b}`, { size: 9.5, indent: 22, after: 2.5 });
    }
    if (s.table) table(s.table, { emphasiseLast: !!s.table.emphasiseLast });
    if (s.note) write(s.note, { size: 8, italic: true, color: MUTED, after: 4 });
  };

  // ---- cover page -----------------------------------------------------------
  const titleSize = (() => {
    pdf.setFont("helvetica", "bold");
    for (let size = 22; size > 12; size -= 1) {
      pdf.setFontSize(size);
      if (pdf.getTextWidth(offer.title) <= WIDTH) return size;
    }
    return 12;
  })();

  const bandH = 116;
  pdf.setFillColor(...ACCENT);
  pdf.rect(0, 0, PAGE_W, bandH, "F");
  pdf.setTextColor(...WHITE);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  pdf.setCharSpace(2.4);
  pdf.text("RAMSIS ENGINEERING", MARGIN, 30);
  pdf.setCharSpace(0);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8.4);
  pdf.text(`Offer ${offer.offerNo}  ·  Rev. ${offer.revision}  ·  ${offer.dateLabel}`, PAGE_W - MARGIN, 30, {
    align: "right",
  });
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(titleSize);
  pdf.text(offer.title, MARGIN, 32 + titleSize);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(244, 214, 214);
  const subtitle = pdf.splitTextToSize(offer.subject, WIDTH) as string[];
  subtitle.slice(0, 2).forEach((line, i) => pdf.text(line, MARGIN, 34 + titleSize + 16 + i * 12));

  y = bandH + 24;
  const gap = 9;
  const colW = (WIDTH - gap * 2) / 3;
  const parties = [
    { label: "End user", value: offer.endUser || "—", detail: "Plant owner / site" },
    { label: "Client (EPC)", value: offer.client || "—", detail: offer.clientAddress || "Issues the purchase order" },
    { label: "Ramsis Engineering", value: "Sitra, Bahrain", detail: "Design · fabrication · supply" },
  ];
  parties.forEach((p, i) => {
    const x = MARGIN + i * (colW + gap);
    pdf.setFillColor(...ACCENT);
    pdf.rect(x, y, colW, 2.2, "F");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(7);
    pdf.setTextColor(...MUTED);
    pdf.setCharSpace(1.2);
    pdf.text(p.label.toUpperCase(), x, y + 14);
    pdf.setCharSpace(0);
    pdf.setFontSize(9.4);
    pdf.setTextColor(...INK);
    const val = pdf.splitTextToSize(p.value, colW) as string[];
    val.slice(0, 2).forEach((line, li) => pdf.text(line, x, y + 27 + li * 11));
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7.2);
    pdf.setTextColor(...MUTED);
    pdf.text(p.detail, x, y + 27 + Math.min(val.length, 2) * 11 + 5);
  });
  y += 62;

  const stats = [
    { label: "Quoted value", value: offer.priced ? `${offer.currency.code} ${Math.round(offer.totals.grand).toLocaleString("en-US")}` : "Unpriced" },
    { label: "Delivery", value: `${offer.deliveryWeeks} weeks` },
    { label: "Validity", value: `${offer.validityDays} days` },
  ];
  const boxH = 50;
  stats.forEach((s, i) => {
    const x = MARGIN + i * (colW + gap);
    pdf.setFillColor(...CARD);
    pdf.rect(x, y, colW, boxH, "F");
    pdf.setFillColor(...ACCENT);
    pdf.rect(x, y, 3, boxH, "F");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(6.8);
    pdf.setTextColor(...MUTED);
    pdf.setCharSpace(1);
    pdf.text(s.label.toUpperCase(), x + 11, y + 17);
    pdf.setCharSpace(0);
    pdf.setFontSize(12.5);
    pdf.setTextColor(...ACCENT);
    pdf.text(s.value, x + 11, y + 37);
  });
  y += boxH + 26;

  write(offer.attention, { size: 9.8, bold: true, after: 8 });
  write("Dear Sir,", { size: 9.5, after: 10 });
  for (const p of offer.intro) write(p, { size: 9.6, after: 7 });

  y += 8;
  for (const c of offer.closing) write(c, { size: 9.5, after: c.endsWith("faithfully,") ? 30 : 2 });
  offer.signature.forEach((line, i) =>
    write(line, {
      size: i === 0 ? 10 : 9,
      bold: i === 0 || i === 2,
      color: i === 0 ? ACCENT : i === 1 ? MUTED : INK,
      after: 1.5,
    }),
  );

  // ---- proposal body --------------------------------------------------------
  newPage();
  write(
    offer.offerType === "Techno-Commercial" ? "TECHNO - COMMERCIAL PROPOSAL" : `${offer.offerType.toUpperCase()} PROPOSAL`,
    { size: 15, bold: true, color: ACCENT, charSpace: 0.6, after: 3 },
  );
  write("Scope, technical terms and commercial conditions", { size: 8.8, color: MUTED, after: 8 });
  hairline();
  y += 10;

  table({
    head: [],
    widths: [1.5, 4.3],
    align: ["left", "left"],
    rows: offer.meta.map((m) => [m.label, m.value]),
  });

  for (const s of offer.sections) section(s);

  y += 10;
  hairline();
  y += 8;
  write(
    "This offer is issued for review and acceptance. All calculations are estimating-grade until the fabrication drawings are approved.",
    { size: 7.6, italic: true, color: MUTED },
  );

  // ---- page furniture -------------------------------------------------------
  const pages = pdf.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    pdf.setPage(i);
    if (i > 1) {
      pdf.setFillColor(...ACCENT);
      pdf.rect(0, 0, PAGE_W, 30, "F");
      pdf.setTextColor(...WHITE);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(7.6);
      pdf.setCharSpace(2);
      pdf.text("RAMSIS ENGINEERING", MARGIN, 19);
      pdf.setCharSpace(0);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(7.6);
      pdf.text(`${offer.offerNo}  ·  Rev. ${offer.revision}  ·  ${offer.dateLabel}`, PAGE_W - MARGIN, 19, {
        align: "right",
      });
    }
    pdf.setDrawColor(...RULE);
    pdf.setLineWidth(0.6);
    pdf.line(MARGIN, PAGE_H - 34, PAGE_W - MARGIN, PAGE_H - 34);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7.2);
    pdf.setTextColor(...MUTED);
    pdf.text(`${offer.offerNo} · Rev. ${offer.revision}`, MARGIN, PAGE_H - 20);
    pdf.text(offer.client.slice(0, 60), PAGE_W / 2, PAGE_H - 20, { align: "center" });
    pdf.text(`Page ${i} of ${pages}`, PAGE_W - MARGIN, PAGE_H - 20, { align: "right" });
  }

  return pdf;
}

export function exportProposalPdf(offer: ProposalDoc): void {
  renderProposalPdf(offer).save(proposalFileName(offer, "pdf"));
}

/** object URL of the rendered A4 offer, used by the in-app preview */
export function proposalPdfUrl(offer: ProposalDoc): string {
  const pdf = renderProposalPdf(offer);
  return URL.createObjectURL(pdf.output("blob"));
}
