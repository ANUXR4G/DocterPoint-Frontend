import { llmAvailable, llmChatProviders } from "../../lib/llm.js";

const SYSTEM = `You help clinic doctors prepare for outpatient visits in India (GlucoGuide).

Given the patient's own words about why they are booking, write a short clinical visit brief for the doctor.

Rules:
- Do NOT diagnose, prescribe, or invent labs/vitals the patient did not mention.
- Clarify what the patient seems to mean in plain clinical language.
- Note duration, severity, red flags, or follow-up context only if present or reasonably implied from their words.
- Suggest 2–4 focused history/exam points the doctor may want to cover.
- If the text is vague, say so and list clarifying questions.
- No markdown headings. Use short labeled lines:
  Chief complaint:
  Understanding:
  Suggest clarify:
- Max ~120 words. English. No emojis. Not for the patient.`;

function cleanBrief(raw: string): string {
  let text = String(raw ?? "")
    .replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, "")
    .replace(/<\/?think\b[^>]*>/gi, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (text.length > 900) {
    const cut = text.slice(0, 900);
    const lastStop = Math.max(
      cut.lastIndexOf(". "),
      cut.lastIndexOf("\n"),
    );
    text = (lastStop > 200 ? cut.slice(0, lastStop + 1) : cut).trim();
  }
  return text;
}

function fallbackBrief(patientText: string): string {
  return [
    "Chief complaint:",
    patientText,
    "",
    "Understanding:",
    "Patient described the issue in their own words above. AI brief unavailable — review as stated.",
    "",
    "Suggest clarify:",
    "Onset/duration, severity, associated symptoms, prior treatment, and red-flag symptoms.",
  ].join("\n");
}

/**
 * Turn patient booking problem text into a doctor-facing visit brief.
 * Never throws — falls back to a structured copy of the patient text.
 */
export async function buildDoctorVisitBrief(
  patientProblem: string,
): Promise<{ brief: string; source: "llm" | "fallback" }> {
  const raw = patientProblem.trim().slice(0, 2000);
  if (!raw) {
    return { brief: "", source: "fallback" };
  }
  if (!llmAvailable()) {
    return { brief: fallbackBrief(raw), source: "fallback" };
  }

  const providers = llmChatProviders();
  for (const provider of providers) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);
    try {
      const isHuggingFace = /huggingface/i.test(provider.label);
      const res = await fetch(provider.url, {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${provider.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: provider.model,
          temperature: 0.2,
          top_p: 0.85,
          messages: [
            { role: "system", content: SYSTEM },
            {
              role: "user",
              content: `Patient's problem / reason for visit:\n"""${raw}"""\n\n/no_think`,
            },
          ],
          max_tokens: 280,
          ...(isHuggingFace
            ? { chat_template_kwargs: { enable_thinking: false } }
            : {}),
        }),
      });

      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      if (!res.ok) continue;

      const brief = cleanBrief(data.choices?.[0]?.message?.content ?? "");
      if (brief.length >= 40) {
        return { brief, source: "llm" };
      }
    } catch (err) {
      console.warn(
        `[patientProblemBrief] ${provider.label}:`,
        err instanceof Error ? err.message : err,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  return { brief: fallbackBrief(raw), source: "fallback" };
}

/** Persist patient words + AI brief for doctor UIs (notes field). */
export function formatPatientProblemNotes(
  patientProblem: string,
  aiBrief: string,
): string {
  const patient = patientProblem.trim();
  const brief = aiBrief.trim();
  if (!patient && !brief) return "";
  if (!brief) return `Patient's description:\n${patient}`;
  if (!patient) return brief;
  return [
    "Patient's description:",
    patient,
    "",
    "AI brief for doctor:",
    brief,
  ].join("\n");
}
