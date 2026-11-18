// Simple document PDFs (Form 1 acknowledgement, orders, closure certificate) with pdf-lib (COM-11).

import { degrees, PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";

export type PdfSection = { heading?: string; rows?: [string, string][]; paragraphs?: string[] };

const A4: [number, number] = [595.28, 841.89];
const MARGIN = 50;

/** pdf-lib's standard fonts only cover WinAnsi; replace anything else so generation never fails. */
function clean(s: string) {
  return s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/₹/g, "Rs.").replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");
}

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const words = clean(text).split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(next, size) > width && line) {
      lines.push(line);
      line = w;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

export async function buildPdf(opts: { title: string; subtitle?: string; sections: PdfSection[]; footer?: string; watermark?: string }): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let page: PDFPage = doc.addPage(A4);
  let y = A4[1] - MARGIN;
  const width = A4[0] - 2 * MARGIN;

  const ensure = (h: number) => {
    if (y - h < MARGIN + 30) {
      page = doc.addPage(A4);
      y = A4[1] - MARGIN;
    }
  };
  const text = (s: string, x: number, f: PDFFont, size: number, color = rgb(0.1, 0.12, 0.18)) => page.drawText(clean(s), { x, y, size, font: f, color });

  text("Government of Assam - Sewa Setu", MARGIN, bold, 10, rgb(0.03, 0.26, 0.24));
  y -= 18;
  for (const l of wrap(opts.title, bold, 15, width)) { text(l, MARGIN, bold, 15); y -= 19; }
  if (opts.subtitle) { for (const l of wrap(opts.subtitle, font, 10, width)) { text(l, MARGIN, font, 10, rgb(0.35, 0.38, 0.45)); y -= 13; } }
  y -= 6;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: A4[0] - MARGIN, y }, thickness: 0.7, color: rgb(0.7, 0.72, 0.75) });
  y -= 16;

  for (const s of opts.sections) {
    if (s.heading) { ensure(30); text(s.heading, MARGIN, bold, 11.5, rgb(0.03, 0.26, 0.24)); y -= 16; }
    for (const [k, v] of s.rows ?? []) {
      const valLines = wrap(v || "-", font, 10, width - 180);
      ensure(valLines.length * 13 + 4);
      const keyLines = wrap(k, bold, 9.5, 170);
      const startY = y;
      for (const kl of keyLines) { text(kl, MARGIN, bold, 9.5, rgb(0.3, 0.33, 0.4)); y -= 12; }
      const afterKey = y;
      y = startY;
      for (const vl of valLines) { text(vl, MARGIN + 180, font, 10); y -= 13; }
      y = Math.min(y, afterKey) - 4;
    }
    for (const p of s.paragraphs ?? []) {
      for (const l of wrap(p, font, 10, width)) { ensure(14); text(l, MARGIN, font, 10); y -= 13; }
      y -= 5;
    }
    y -= 8;
  }
  if (opts.footer) {
    ensure(40);
    y -= 10;
    for (const l of wrap(opts.footer, font, 8.5, width)) { text(l, MARGIN, font, 8.5, rgb(0.4, 0.42, 0.48)); y -= 11; }
  }
  if (opts.watermark) {
    for (const p of doc.getPages()) p.drawText(clean(opts.watermark), { x: 120, y: 380, size: 40, font: bold, color: rgb(0.85, 0.85, 0.85), opacity: 0.35, rotate: degrees(35) });
  }
  return doc.save();
}

export function pdfResponse(bytes: Uint8Array, filename: string) {
  return new Response(Buffer.from(bytes), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${filename}"` },
  });
}
