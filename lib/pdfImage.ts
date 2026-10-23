import { resolveUploadUrl } from "@/lib/uploads"
import type { PDFDocument, PDFImage } from "pdf-lib"

/**
 * pdf-lib only embeds PNG/JPEG. Cloudinary often serves WebP/AVIF for the
 * same asset — force a PNG delivery URL so logos and stamps appear on PDFs.
 */
export function pdfFriendlyImageUrl(raw?: string | null): string {
  const url = resolveUploadUrl(raw)
  if (!url) return ""
  if (!url.includes("res.cloudinary.com") || !url.includes("/image/upload/")) {
    return url
  }
  if (/\/image\/upload\/(?:[^/]+,)*f_(?:png|jpg|jpeg)\b/i.test(url)) {
    return url
  }
  return url.replace("/image/upload/", "/image/upload/f_png/")
}

export async function embedPdfImage(
  doc: PDFDocument,
  rawUrl?: string | null,
): Promise<PDFImage | null> {
  if (!rawUrl) return null
  const url = pdfFriendlyImageUrl(rawUrl)
  if (!url) return null
  try {
    if (url.startsWith("data:")) {
      const base64 = url.split(",")[1]
      if (!base64) return null
      const binary = atob(base64)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
      if (bytes[0] === 0x89 && bytes[1] === 0x50) return doc.embedPng(bytes)
      if (bytes[0] === 0xff && bytes[1] === 0xd8) return doc.embedJpg(bytes)
      return null
    }
    if (!/^https?:/i.test(url)) return null
    const res = await fetch(url)
    if (!res.ok) return null
    const bytes = new Uint8Array(await res.arrayBuffer())
    if (bytes[0] === 0x89 && bytes[1] === 0x50) return doc.embedPng(bytes)
    if (bytes[0] === 0xff && bytes[1] === 0xd8) return doc.embedJpg(bytes)
    // Last resort: ask Cloudinary again as JPEG if first response wasn't PNG/JPG
    if (url.includes("res.cloudinary.com") && url.includes("/f_png/")) {
      const jpgUrl = url.replace("/f_png/", "/f_jpg/")
      const retry = await fetch(jpgUrl)
      if (!retry.ok) return null
      const jpgBytes = new Uint8Array(await retry.arrayBuffer())
      if (jpgBytes[0] === 0xff && jpgBytes[1] === 0xd8) {
        return doc.embedJpg(jpgBytes)
      }
    }
  } catch {
    return null
  }
  return null
}
