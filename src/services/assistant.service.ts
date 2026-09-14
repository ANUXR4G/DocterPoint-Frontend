import { AppError } from "../core/response.js";
import { llmChatProviders, llmAvailable } from "../lib/llm.js";

export type ChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

const QA_SYSTEM = `You are Mira in the GlucoGuide patient app (India clinic booking + light diabetes care navigation).

OUTPUT RULES (strict):
- Reply with ONLY the final message the patient should read.
- Never include planning, analysis, drafts, self-talk, or “I should…”.
- Never include <think> blocks, reasoning, or system/prompt mentions.
- 1–3 short sentences. Plain text. No markdown, bullets, or numbered lists.
- No emojis. No “As an AI…”. No filler intros/outros.
- Do not end every reply with a question.
- Never invent clinic hours, fees, or phone numbers — send them to Find clinics or WhatsApp the clinic.
- Not a doctor: for symptoms, say book a visit or seek urgent care — once, briefly.

You help with: Find clinics, booking (slot/token), WhatsApp (REGISTER / BOOK / STATUS), login, and brief non-clinical lifestyle tips.`;

/** Strip Qwen/HF thinking + planning leakage; keep only user-facing text. */
export function cleanAssistantReply(raw: string): string {
  let text = String(raw ?? "");

  // Common think / reasoning wrappers from Qwen-family models.
  text = text
    .replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, "")
    .replace(/<\/?think\b[^>]*>/gi, "")
    .replace(/<thinking\b[^>]*>[\s\S]*?<\/thinking>/gi, "")
    .replace(/<\/?thinking\b[^>]*>/gi, "")
    .replace(/```(?:thinking|reasoning)[\s\S]*?```/gi, "");

  // If the model pasted reasoning then a final answer marker.
  const finalMarkers = [
    /(?:^|\n)\s*(?:final(?:\s+answer)?|answer|reply)\s*:\s*/i,
    /(?:^|\n)\s*(?:here's|here is)\s+(?:my|the)\s+(?:reply|answer)\s*:\s*/i,
  ];
  for (const marker of finalMarkers) {
    const parts = text.split(marker);
    if (parts.length > 1) {
      text = parts[parts.length - 1] ?? text;
    }
  }

  // Drop chain-of-thought paragraphs that talk about the prompt / drafting.
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  const planningLike =
    /^(we need|i need to|let'?s|the user|looking at|as mira|my (?:reply|response) should|keep (?:it )?brief|draft|plan:)/i;
  const kept = paragraphs.filter((p) => !planningLike.test(p));
  if (kept.length) {
    text = kept.join("\n\n");
  } else if (paragraphs.some((p) => planningLike.test(p))) {
    // Entire payload was planning — do not show it.
    return "";
  }

  text = text
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*\d+[.)]\s+/gm, "")
    .replace(/^\s*[-*•]\s+/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();

  // Still looks like internal monologue → keep last 1–2 sentences only.
  if (
    /\b(we need|let'?s craft|the user (?:said|asked)|i should)\b/i.test(text) &&
    text.length > 180
  ) {
    const sentences = text
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
    text = sentences.slice(-2).join(" ").trim();
  }

  // Hard cap — chat bubbles shouldn't essay.
  if (text.length > 420) {
    const cut = text.slice(0, 420);
    const lastStop = Math.max(
      cut.lastIndexOf(". "),
      cut.lastIndexOf("? "),
      cut.lastIndexOf("! "),
    );
    text = (lastStop > 120 ? cut.slice(0, lastStop + 1) : cut).trim();
  }

  return text;
}

function extractUserFacingReply(message?: {
  content?: string;
  reasoning?: string;
}): string {
  // Never treat raw `reasoning` as the chat reply — that is the unwanted dump.
  const fromContent = cleanAssistantReply(message?.content ?? "");
  if (fromContent) return fromContent;

  // Last resort: if content was empty but reasoning somehow embeds a final line.
  const fromReasoning = cleanAssistantReply(message?.reasoning ?? "");
  if (
    fromReasoning &&
    fromReasoning.length <= 280 &&
    !/\b(we need|let'?s|the user|i should|draft)\b/i.test(fromReasoning)
  ) {
    return fromReasoning;
  }

  return "";
}

type Provider = {
  label: string;
  url: string;
  apiKey: string;
  model: string;
  jsonObject?: boolean;
};

function chatProviders(): Provider[] {
  return llmChatProviders();
}

export function assistantAvailable(): boolean {
  return llmAvailable();
}

export const AssistantService = {
  available: assistantAvailable,

  async chat(input: {
    message: string;
    history?: ChatMessage[];
    userName?: string | null;
  }): Promise<{ reply: string; provider: string }> {
    const message = input.message.trim();
    if (!message) {
      throw new AppError(400, "Message is required.");
    }
    if (message.length > 2000) {
      throw new AppError(400, "Message is too long (max 2000 characters).");
    }

    const providers = chatProviders();
    if (!providers.length) {
      throw new AppError(
        503,
        "Assistant is offline — set OPENAI_API_KEY on the server.",
      );
    }

    const history = (input.history ?? [])
      .filter(
        (m) =>
          (m.role === "user" || m.role === "assistant") &&
          typeof m.content === "string" &&
          m.content.trim(),
      )
      .slice(-12)
      .map((m) => ({
        role: m.role,
        content: m.content.trim().slice(0, 2000),
      }));

    const systemExtra = input.userName
      ? `\nSigned-in name (use sparingly): ${input.userName}.`
      : "";

    // Soft /no_think for Qwen when hard switch is ignored by a route.
    const userContent = `${message}\n\n/no_think`;

    const messages: ChatMessage[] = [
      { role: "system", content: QA_SYSTEM + systemExtra },
      ...history,
      { role: "user", content: userContent },
    ];

    let lastError = "Assistant provider failed.";

    for (const provider of providers) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 45_000);
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
            temperature: 0.35,
            top_p: 0.8,
            messages,
            max_tokens: 160,
            ...(isHuggingFace
              ? { chat_template_kwargs: { enable_thinking: false } }
              : {}),
          }),
        });

        const data = (await res.json()) as {
          choices?: Array<{
            message?: { content?: string; reasoning?: string };
          }>;
          error?: { message?: string } | string;
        };

        if (!res.ok) {
          lastError =
            (typeof data.error === "string"
              ? data.error
              : data.error?.message) ?? `${provider.label} request failed.`;
          console.warn(`[assistant] ${provider.label}:`, lastError);
          continue;
        }

        const reply = extractUserFacingReply(data.choices?.[0]?.message);
        if (!reply) {
          lastError = `${provider.label} returned an empty reply.`;
          continue;
        }

        return { reply, provider: provider.label };
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          lastError = `${provider.label} timed out.`;
        } else {
          lastError =
            err instanceof Error ? err.message : `${provider.label} failed.`;
        }
        console.warn(`[assistant] ${provider.label}:`, lastError);
      } finally {
        clearTimeout(timer);
      }
    }

    throw new AppError(
      502,
      /depleted|credits|quota|rate limit/i.test(lastError)
        ? "Mira’s AI credits are used up. Add OPENAI_API_KEY or top up Hugging Face credits on the server, then try again."
        : lastError,
    );
  },
};
