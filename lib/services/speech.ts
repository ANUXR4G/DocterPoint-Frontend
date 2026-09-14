import { readJson } from "@/lib/readJson"

let serverSttCache: boolean | null = null

export function clearServerSpeechCache() {
  serverSttCache = null
}

export async function isServerSpeechAvailable(force = false): Promise<boolean> {
  if (!force && serverSttCache !== null) return serverSttCache
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_API}/assistant/status`, {
      credentials: "include",
    })
    const json = await readJson<{
      status: string
      data?: { speechServer?: boolean }
    }>(res, { status: "unsuccessful", data: { speechServer: false } })
    serverSttCache = Boolean(json.data?.speechServer)
  } catch {
    serverSttCache = false
  }
  return serverSttCache
}

function encodeWav(audioBuffer: AudioBuffer, sampleRate = 16000): Blob {
  const channel = audioBuffer.getChannelData(0)
  const length = channel.length
  const buffer = new ArrayBuffer(44 + length * 2)
  const view = new DataView(buffer)

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i += 1) {
      view.setUint8(offset + i, str.charCodeAt(i))
    }
  }

  writeString(0, "RIFF")
  view.setUint32(4, 36 + length * 2, true)
  writeString(8, "WAVE")
  writeString(12, "fmt ")
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeString(36, "data")
  view.setUint32(40, length * 2, true)

  let offset = 44
  for (let i = 0; i < length; i += 1) {
    const sample = Math.max(-1, Math.min(1, channel[i] ?? 0))
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
    offset += 2
  }

  return new Blob([buffer], { type: "audio/wav" })
}

/** Convert browser MediaRecorder blobs to WAV for server STT (HF Whisper). */
export async function audioBlobToWavBlob(blob: Blob): Promise<Blob> {
  const type = blob.type.toLowerCase()
  if (type.includes("wav")) return blob
  if (typeof window === "undefined") return blob
  if (!blob.size) throw new Error("Empty audio recording")

  const ctx = new AudioContext({ sampleRate: 16000 })
  try {
    const decoded = await ctx.decodeAudioData(await blob.arrayBuffer())
    if (!decoded.length) throw new Error("No audio in recording")
    return encodeWav(decoded, 16000)
  } finally {
    await ctx.close()
  }
}

export async function transcribeAudioBlob(
  blob: Blob,
): Promise<{ text: string } | { error: string }> {
  if (!blob.size) {
    return { error: "No audio recorded. Tap the mic and speak, then tap again to stop." }
  }

  let payload: Blob
  let mimeType = "audio/wav"
  try {
    payload = await audioBlobToWavBlob(blob)
  } catch {
    return {
      error:
        "Could not read the recording. Try Chrome or Edge, speak for at least 2 seconds, then tap the mic again.",
    }
  }

  const base64 = await blobToBase64(payload)
  const res = await fetch(`${process.env.NEXT_PUBLIC_API}/assistant/transcribe`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ audioBase64: base64, mimeType }),
  })
  const json = await readJson<{
    status: string
    message?: string
    data?: { text?: string }
  }>(res, {
    status: "unsuccessful",
    message: "Transcription failed.",
  })

  if (json.status !== "successful") {
    return { error: json.message ?? "Transcription failed." }
  }
  const text = json.data?.text?.trim()
  if (!text) return { error: "No speech detected. Try again." }
  return { text }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const result = reader.result
      if (typeof result !== "string") {
        reject(new Error("Could not read audio"))
        return
      }
      const comma = result.indexOf(",")
      resolve(comma >= 0 ? result.slice(comma + 1) : result)
    }
    reader.onerror = () => reject(reader.error ?? new Error("Could not read audio"))
    reader.readAsDataURL(blob)
  })
}
