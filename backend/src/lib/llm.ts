import { settings } from "../config/index.js";

export type LlmChatProvider = {
  label: string;
  url: string;
  apiKey: string;
  model: string;
  /** OpenAI / DeepSeek support json_object; many HF routes do not. */
  jsonObject?: boolean;
};

/**
 * OpenAI-compatible chat providers for Mira / NLU-style text chat.
 * OpenAI only by default — Hugging Face is opt-in (vision/OCR may still use it).
 */
export function llmChatProviders(opts?: {
  /** Include OpenAI (gpt-4o-mini). Default true. */
  includeOpenAi?: boolean;
  /** Include DeepSeek text fallback. Default false for Mira reliability. */
  includeDeepSeek?: boolean;
  /** Include Hugging Face. Default false — Mira must not depend on HF. */
  includeHuggingFace?: boolean;
}): LlmChatProvider[] {
  const includeOpenAi = opts?.includeOpenAi !== false;
  const includeDeepSeek = opts?.includeDeepSeek === true;
  const includeHuggingFace = opts?.includeHuggingFace === true;
  const out: LlmChatProvider[] = [];

  if (includeOpenAi && settings.openaiApiKey) {
    out.push({
      label: "OpenAI",
      url: "https://api.openai.com/v1/chat/completions",
      apiKey: settings.openaiApiKey,
      model: process.env.OPENAI_CHAT_MODEL?.trim() || "gpt-4o-mini",
      jsonObject: true,
    });
  }

  if (includeHuggingFace && settings.hfToken) {
    out.push({
      label: "Hugging Face",
      url: `${settings.hfBaseUrl}/chat/completions`,
      apiKey: settings.hfToken,
      model: settings.hfChatModel,
    });
  }

  if (includeDeepSeek && settings.deepseekApiKey) {
    out.push({
      label: "DeepSeek",
      url: "https://api.deepseek.com/chat/completions",
      apiKey: settings.deepseekApiKey,
      model: "deepseek-chat",
      jsonObject: true,
    });
  }

  return out;
}

/** Mira + patient/doctor app chatbot — OpenAI only. */
export function llmMiraProviders(): LlmChatProvider[] {
  return llmChatProviders({
    includeOpenAi: true,
    includeDeepSeek: false,
    includeHuggingFace: false,
  });
}

export function llmAvailable(): boolean {
  return llmMiraProviders().length > 0;
}

/** Vision / OCR providers for ID and visiting-card images. OpenAI first. */
export function llmVisionProviders(): LlmChatProvider[] {
  const out: LlmChatProvider[] = [];

  if (settings.openaiApiKey) {
    out.push({
      label: "OpenAI",
      url: "https://api.openai.com/v1/chat/completions",
      apiKey: settings.openaiApiKey,
      model: process.env.OPENAI_OCR_MODEL?.trim() || "gpt-4o-mini",
      jsonObject: true,
    });
  }

  if (settings.hfToken) {
    out.push({
      label: "Hugging Face",
      url: `${settings.hfBaseUrl}/chat/completions`,
      apiKey: settings.hfToken,
      model: settings.hfOcrModel || settings.hfChatModel,
    });
  }

  return out;
}

export function llmVisionAvailable(): boolean {
  return llmVisionProviders().length > 0;
}
