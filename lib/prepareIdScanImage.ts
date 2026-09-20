/** Resize ID photos before OCR so uploads stay fast and readable. */
export async function prepareIdScanImage(
  file: File,
): Promise<{ base64: string; mimeType: string }> {
  // Keep enough resolution for Aadhaar small print (was 1280 @ 0.85 — too soft).
  const maxDim = 1800
  const mimeType = "image/jpeg"

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
          canvas.toBlob(resolve, mimeType, 0.92)
        })
        if (blob) return blobToPayload(blob, mimeType)
      } else {
        bitmap.close()
      }
    } catch {
      /* fall through */
    }
  }

  return fileToPayload(file)
}

function fileToPayload(file: File): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result || "")
      const match = /^data:([^;]+);base64,(.+)$/.exec(result)
      if (!match) {
        reject(new Error("Could not read file."))
        return
      }
      resolve({ mimeType: match[1]!, base64: match[2]! })
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
