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
 * Shared OpenAI-compatible chat providers.
 * OpenAI first when set (faster); HF / DeepSeek as fallbacks.
 */
export function llmChatProviders(opts?: {
  /** Include OpenAI (gpt-4o-mini). */
  includeOpenAi?: boolean;
  /** Include DeepSeek text fallback. */
  includeDeepSeek?: boolean;
}): LlmChatProvider[] {
  const includeOpenAi = opts?.includeOpenAi !== false;
  const includeDeepSeek = opts?.includeDeepSeek !== false;
  const out: LlmChatProvider[] = [];

  if (includeOpenAi && settings.openaiApiKey) {
    out.push({
      label: "OpenAI",
      url: "https://api.openai.com/v1/chat/completions",
      apiKey: settings.openaiApiKey,
      model: "gpt-4o-mini",
      jsonObject: true,
    });
  }

  if (settings.hfToken) {
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

export function llmAvailable(): boolean {
  return Boolean(
    settings.hfToken || settings.openaiApiKey || settings.deepseekApiKey,
  );
}

/** Vision / OCR providers for ID and visiting-card images. OpenAI first when set (typically faster). */
export function llmVisionProviders(): LlmChatProvider[] {
  const out: LlmChatProvider[] = [];

  if (settings.openaiApiKey) {
    out.push({
      label: "OpenAI",
      url: "https://api.openai.com/v1/chat/completions",
      apiKey: settings.openaiApiKey,
      model: "gpt-4o-mini",
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
