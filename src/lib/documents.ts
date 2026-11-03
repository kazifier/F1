// ---------------------------------------------------------------------------
// Client-side document reading for the AI intake page.
// PDF -> text per page (+ page rasters for drawings / scans)
// DOCX -> paragraph & table text, XLSX -> one CSV block per sheet
// Images -> sent straight to a vision model
// Nothing leaves the browser until the user runs the extraction.
// ---------------------------------------------------------------------------
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

// the parsers are large (pdf.js, SheetJS) — load them only when a file needs them
type Pdf = typeof import("pdfjs-dist");
let pdfModule: Pdf | null = null;
async function pdfLoad(): Promise<Pdf> {
  if (!pdfModule) {
    pdfModule = await import("pdfjs-dist");
    pdfModule.GlobalWorkerOptions.workerSrc = workerUrl;
  }
  return pdfModule;
}

export type DocKind = "pdf" | "docx" | "xlsx" | "text" | "image";

export interface DocPage {
  /** "page 3" / "Sheet: Datasheet" / "Image" */
  label: string;
  text: string;
  /** JPEG data URL, only for pages worth showing a vision model */
  image?: string;
}

export interface ExtractedDoc {
  name: string;
  kind: DocKind;
  pages: DocPage[];
  chars: number;
  images: number;
  note?: string;
}

const MAX_PAGES = 25;
const MAX_CHARS_PER_DOC = 60_000;
const MAX_IMAGES = 8;
const IMAGE_WIDTH = 1100;

const kindOf = (file: File): DocKind => {
  const n = file.name.toLowerCase();
  if (n.endsWith(".pdf")) return "pdf";
  if (n.endsWith(".docx")) return "docx";
  if (n.endsWith(".xlsx") || n.endsWith(".xlsm") || n.endsWith(".xls")) return "xlsx";
  if (/\.(png|jpe?g|webp|gif|bmp)$/.test(n)) return "image";
  if (/\.(txt|csv|tsv|md|json|xml)$/.test(n)) return "text";
  return "text";
};

export const isSupported = (file: File) =>
  /\.(pdf|docx|xlsx|xlsm|xls|png|jpe?g|webp|gif|bmp|txt|csv|tsv|md|json|xml)$/i.test(file.name);

async function readPdf(file: File): Promise<ExtractedDoc> {
  const pdfjs = await pdfLoad();
  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buf, isEvalSupported: false, useWorkerFetch: false }).promise;
  const pages: DocPage[] = [];
  let images = 0;
  const total = Math.min(doc.numPages, MAX_PAGES);

  for (let i = 1; i <= total; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();

    // rebuild lines from the item positions so "Design Pressure   350 kPa" stays one line
    const rows = new Map<number, { x: number; s: string }[]>();
    for (const item of content.items as { str?: string; transform?: number[] }[]) {
      if (!item.str || !item.transform) continue;
      const y = Math.round(item.transform[5] / 3);
      const line = rows.get(y) ?? [];
      line.push({ x: item.transform[4], s: item.str });
      rows.set(y, line);
    }
    const text = [...rows.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([, line]) =>
        line
          .sort((a, b) => a.x - b.x)
          .map((p) => p.s)
          .join(" ")
          .replace(/\s+/g, " ")
          .trim(),
      )
      .filter(Boolean)
      .join("\n");

    const pageEntry: DocPage = { label: `page ${i}`, text };
    if (images < MAX_IMAGES) {
      try {
        const base = page.getViewport({ scale: 1 });
        const scale = Math.min(2, IMAGE_WIDTH / base.width);
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const ctx = canvas.getContext("2d");
        if (ctx) {
          await page.render({ canvasContext: ctx, viewport }).promise;
          pageEntry.image = canvas.toDataURL("image/jpeg", 0.72);
          images++;
        }
      } catch {
        // rasterising can fail for some protected/vector-only PDFs — text still works
      }
    }
    pages.push(pageEntry);
  }

  return {
    name: file.name,
    kind: "pdf",
    pages,
    chars: pages.reduce((s, p) => s + p.text.length, 0),
    images,
    note: doc.numPages > MAX_PAGES ? `read first ${MAX_PAGES} of ${doc.numPages} pages` : undefined,
  };
}

async function readDocx(file: File): Promise<ExtractedDoc> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const xml = await zip.file("word/document.xml")?.async("string");
  if (!xml) throw new Error("This .docx has no readable document body (old .doc files must be saved as .docx).");
  const dom = new DOMParser().parseFromString(xml, "application/xml");
  const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
  const blocks: string[] = [];

  const textOf = (node: Element): string => {
    let out = "";
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    let n: Node | null = walker.currentNode;
    while (n) {
      if (n.nodeType === Node.TEXT_NODE) {
        out += n.nodeValue ?? "";
      } else if (n.nodeType === Node.ELEMENT_NODE) {
        const tag = (n as Element).localName;
        if (tag === "tab") out += "\t";
        else if (tag === "br" || tag === "cr") out += "\n";
      }
      n = walker.nextNode();
    }
    return out;
  };

  const paragraphs = dom.getElementsByTagNameNS(W, "p");
  const seen = new Set<string>();
  for (const p of Array.from(paragraphs)) {
    const s = textOf(p).replace(/[ \t]+/g, " ").trim();
    if (s && !seen.has(s)) {
      seen.add(s);
      blocks.push(s);
    }
  }
  const tables = dom.getElementsByTagNameNS(W, "tbl");
  let tableText = "";
  for (const tbl of Array.from(tables)) {
    const rows = tbl.getElementsByTagNameNS(W, "tr");
    const lines: string[] = [];
    for (const tr of Array.from(rows)) {
      const cells = tr.getElementsByTagNameNS(W, "tc");
      lines.push(
        Array.from(cells)
          .map((td) => textOf(td).replace(/\s+/g, " ").trim())
          .join(" | "),
      );
    }
    tableText += lines.filter(Boolean).join("\n") + "\n";
  }

  const text = [...blocks, "", tableText].join("\n").slice(0, MAX_CHARS_PER_DOC);
  return { name: file.name, kind: "docx", pages: [{ label: "document", text }], chars: text.length, images: 0 };
}

async function readXlsx(file: File): Promise<ExtractedDoc> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
  const pages: DocPage[] = [];
  for (const name of wb.SheetNames) {
    const csv = XLSX.utils.sheet_to_csv(wb.Sheets[name], { blankrows: false });
    if (!csv.trim()) continue;
    pages.push({ label: `sheet “${name}”`, text: csv.slice(0, 20_000) });
  }
  const text = pages.map((p) => `${p.label}\n${p.text}`).join("\n\n").slice(0, MAX_CHARS_PER_DOC);
  return { name: file.name, kind: "xlsx", pages, chars: text.length, images: 0 };
}

async function readText(file: File): Promise<ExtractedDoc> {
  const text = (await file.text()).slice(0, MAX_CHARS_PER_DOC);
  return { name: file.name, kind: "text", pages: [{ label: "text", text }], chars: text.length, images: 0 };
}

async function readImage(file: File): Promise<ExtractedDoc> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error(`Could not read ${file.name}`));
    r.readAsDataURL(file);
  });
  // downscale so a phone photo does not blow the request size
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error(`Could not decode ${file.name}`));
    el.src = dataUrl;
  });
  const scale = Math.min(1, IMAGE_WIDTH / (img.naturalWidth || IMAGE_WIDTH));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round((img.naturalWidth || IMAGE_WIDTH) * scale);
  canvas.height = Math.round((img.naturalHeight || 1) * scale);
  const ctx = canvas.getContext("2d");
  let image = dataUrl;
  if (ctx) {
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    image = canvas.toDataURL("image/jpeg", 0.8);
  }
  return {
    name: file.name,
    kind: "image",
    pages: [{ label: "image", text: "", image }],
    chars: 0,
    images: 1,
  };
}

export async function readDocument(file: File): Promise<ExtractedDoc> {
  switch (kindOf(file)) {
    case "pdf":
      return readPdf(file);
    case "docx":
      return readDocx(file);
    case "xlsx":
      return readXlsx(file);
    case "image":
      return readImage(file);
    default:
      return readText(file);
  }
}

/** flat text of a set of documents, page labels kept so the model can cite them */
export function documentsToText(docs: ExtractedDoc[], limit = 100_000): string {
  const parts: string[] = [];
  for (const doc of docs) {
    parts.push(`===== FILE: ${doc.name} (${doc.kind}) =====`);
    for (const page of doc.pages) {
      if (!page.text.trim()) continue;
      parts.push(`--- ${doc.name} · ${page.label} ---`);
      parts.push(page.text);
    }
  }
  return parts.join("\n").slice(0, limit);
}

export function documentsToImages(docs: ExtractedDoc[], limit = 8): string[] {
  const out: string[] = [];
  for (const doc of docs) {
    for (const page of doc.pages) {
      if (page.image) out.push(page.image);
      if (out.length >= limit) return out;
    }
  }
  return out;
}
