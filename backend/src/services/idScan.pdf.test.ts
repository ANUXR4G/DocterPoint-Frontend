/**
 * Smoke: PDF first-page rasterize used by IdScanService (no vision API call).
 */
import assert from "node:assert/strict";

async function pdfFirstPageToPng(pdfBytes: Buffer): Promise<Buffer> {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const { createCanvas } = await import("@napi-rs/canvas");

  const loadingTask = getDocument({
    data: new Uint8Array(pdfBytes),
    useSystemFonts: true,
    disableWorker: true,
  } as Parameters<typeof getDocument>[0]);
  const pdf = await loadingTask.promise;
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 2 });
  const canvas = createCanvas(
    Math.ceil(viewport.width),
    Math.ceil(viewport.height),
  );
  const ctx = canvas.getContext("2d");
  await page
    .render({
      canvas: canvas as unknown as HTMLCanvasElement,
      canvasContext: ctx as unknown as CanvasRenderingContext2D,
      viewport,
    })
    .promise;
  return canvas.toBuffer("image/png");
}

const pdfBytes = Buffer.from(
  `%PDF-1.4
1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj
2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj
3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents 4 0 R /Resources<< /Font<< /F1 5 0 R >> >> >>endobj
4 0 obj<< /Length 55 >>stream
BT /F1 24 Tf 40 70 Td (AADHAAR TEST) Tj ET
endstream
endobj
5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000264 00000 n 
0000000369 00000 n 
trailer<< /Size 6 /Root 1 0 R >>
startxref
446
%%EOF`,
);

const png = await pdfFirstPageToPng(pdfBytes);
assert.ok(png.length > 100, "expected PNG bytes");
assert.equal(png[0], 0x89);
assert.equal(png[1], 0x50);
assert.equal(png[2], 0x4e);
assert.equal(png[3], 0x47);

console.log("idScan.pdf-rasterize.ok", png.length);
