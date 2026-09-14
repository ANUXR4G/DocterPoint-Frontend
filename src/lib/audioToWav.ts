import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const ffmpegPath = require("ffmpeg-static") as string | null;

const WAV_MIMES = new Set([
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/vnd.wave",
]);

function extFromMime(mimeType: string): string {
  const mime = mimeType.toLowerCase().split(";")[0]!.trim();
  if (mime.includes("webm")) return "webm";
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("mp4") || mime.includes("m4a")) return "m4a";
  if (mime.includes("caf")) return "caf";
  if (mime.includes("mp3") || mime.includes("mpeg")) return "mp3";
  if (mime.includes("wav")) return "wav";
  return "bin";
}

function runFfmpeg(args: string[]): Promise<void> {
  const bin = ffmpegPath;
  if (!bin) {
    return Promise.reject(new Error("ffmpeg binary unavailable"));
  }
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    proc.on("error", reject);
    proc.on("close", (code: number | null) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.slice(-400) || `ffmpeg exit ${code}`));
    });
  });
}

/** Normalize browser/mobile clips to 16 kHz mono WAV for HF Whisper. */
export async function normalizeAudioForStt(
  buffer: Buffer,
  mimeType = "audio/webm",
): Promise<{ buffer: Buffer; mimeType: string }> {
  const mime = mimeType.toLowerCase().split(";")[0]!.trim();
  if (WAV_MIMES.has(mime)) {
    return { buffer, mimeType: "audio/wav" };
  }

  const id = randomUUID();
  const inputPath = join(tmpdir(), `stt-${id}.${extFromMime(mimeType)}`);
  const outputPath = join(tmpdir(), `stt-${id}.wav`);

  try {
    await writeFile(inputPath, buffer);
    await runFfmpeg([
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      inputPath,
      "-ar",
      "16000",
      "-ac",
      "1",
      "-f",
      "wav",
      outputPath,
      "-y",
    ]);
    const wav = await import("node:fs/promises").then((fs) =>
      fs.readFile(outputPath),
    );
    return { buffer: wav, mimeType: "audio/wav" };
  } finally {
    await unlink(inputPath).catch(() => {});
    await unlink(outputPath).catch(() => {});
  }
}
