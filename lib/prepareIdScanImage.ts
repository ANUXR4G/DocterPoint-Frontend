/** Prepare ID documents for OCR — images resized; PDFs passed through for server rasterize. */
export async function prepareIdScanImage(
  file: File,
): Promise<{ base64: string; mimeType: string }> {
  const maxDim = 1800
  const jpegMime = "image/jpeg"

  const isPdf =
    file.type === "application/pdf" ||
    file.type === "application/x-pdf" ||
    /\.pdf$/i.test(file.name)

  // PDFs: send raw bytes — backend rasterizes with pdf.js (cmaps/fonts) + text extract.
  if (isPdf) {
    return fileToPayload(file, "application/pdf")
  }

  if (typeof createImageBitmap === "function" && file.type.startsWith("image/")) {
    try {
      const bitmap = await createImageBitmap(file)
      const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height))
      const width = Math.max(1, Math.round(bitmap.width * scale))
      const height = Math.max(1, Math.round(bitmap.height * scale))
      const canvas = document.createElement("canvas")
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext("2d")
      if (ctx) {
        ctx.imageSmoothingEnabled = true
        ctx.imageSmoothingQuality = "high"
        ctx.drawImage(bitmap, 0, 0, width, height)
        bitmap.close()
        const blob = await new Promise<Blob | null>((resolve) => {
          canvas.toBlob(resolve, jpegMime, 0.92)
        })
        if (blob) return blobToPayload(blob, jpegMime)
      } else {
        bitmap.close()
      }
    } catch {
      /* fall through */
    }
  }

  return fileToPayload(file)
}

function fileToPayload(
  file: File,
  forceMime?: string,
): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result || "")
      const match = /^data:([^;]+);base64,(.+)$/.exec(result)
      if (!match) {
        reject(new Error("Could not read file."))
        return
      }
      resolve({
        mimeType: forceMime || match[1]!,
        base64: match[2]!,
      })
    }
    reader.onerror = () => reject(new Error("Could not read file."))
    reader.readAsDataURL(file)
  })
}

function blobToPayload(
  blob: Blob,
  mimeType: string,
): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result || "")
      const match = /^data:([^;]+);base64,(.+)$/.exec(result)
      if (!match) {
        reject(new Error("Could not read file."))
        return
      }
      resolve({ mimeType, base64: match[2]! })
    }
    reader.onerror = () => reject(new Error("Could not read file."))
    reader.readAsDataURL(blob)
  })
}
