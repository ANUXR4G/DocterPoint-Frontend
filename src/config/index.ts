import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const configDir = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(configDir, "../..");
const repoRoot = path.resolve(backendRoot, "..");

// Repo root first (shared secrets), then backend/.env with override so local
// backend DATABASE_URL (gluco_guide) wins over any root .env override.
// On Railway, vars are already in process.env and there is typically no
// backend/.env file — dotenv is a no-op for missing files.
dotenv.config({ path: path.join(repoRoot, ".env") });
dotenv.config({ path: path.join(backendRoot, ".env"), override: true });

function requireEnv(key: string): string {
  const value = process.env[key];
  if (value === undefined || value === "") {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function env(key: string, defaultValue = ""): string {
  return process.env[key] ?? defaultValue;
}

/** Prefer DATABASE_URL on Railway; fall back to discrete POSTGRES_* for local. */
const hasDatabaseUrl = Boolean(process.env.DATABASE_URL?.trim());

export const settings = {
  frontendOrigins: env(
    "FRONTEND_ORIGINS",
    "http://localhost:3000,https://docterpoint-six.vercel.app",
  ),
  postgresUser: hasDatabaseUrl
    ? env("POSTGRES_USER", "postgres")
    : requireEnv("POSTGRES_USER"),
  postgresPass: env("POSTGRES_PASS"),
  postgresHost: hasDatabaseUrl
    ? env("POSTGRES_HOST", "localhost")
    : requireEnv("POSTGRES_HOST"),
  postgresPort: hasDatabaseUrl
    ? env("POSTGRES_PORT", "5432")
    : requireEnv("POSTGRES_PORT"),
  postgresDatabaseName: hasDatabaseUrl
    ? env("POSTGRES_DATABASE_NAME", "postgres")
    : requireEnv("POSTGRES_DATABASE_NAME"),
  // Redis is optional at boot (cache soft-fails). Workers need a real Redis.
  redisPassword: env("REDIS_PASSWORD"),
  redisHost: env("REDIS_HOST", "127.0.0.1"),
  redisPort: Number(env("REDIS_PORT", "6379")),
  jwtSecretKey: env("JWT_SECRET_KEY", "dev-jwt-secret-key-for-local-dev"),
  jwtAlgorithm: env("JWT_ALGORITHM", "HS256") as "HS256",
  hashingSecretKey: env(
    "HASHING_SECRET_KEY",
    "mUhX5P6R7K9/9bbBWuTdpCkvde5oo8a5xee8z0braz4=",
  ),
  accessTokenExpires: Number(env("ACCESS_TOKEN_EXPIRES", "120")),
  refreshTokenExpires: Number(env("REFRESH_TOKEN_EXPIRES", "5")),
  googleClientId: env("GOOGLE_CLIENT_ID"),
  googleClientSecret: env("GOOGLE_CLIENT_SECRET"),
  googleRedirectUri: env("GOOGLE_REDIRECT_URI"),
  ownerEmail: env("OWNER_EMAIL", "admin@glucoguide.com"),
  smtpPassword: env("SMTP_PASSWORD"),
  smtpPort: Number(env("SMTP_PORT", "587")),
  smtpHost: env("SMTP_HOST", "smtp.gmail.com"),
  deepseekApiKey: process.env.DEEPSEEK_API_KEY ?? "",
  openaiApiKey: process.env.OPENAI_API_KEY ?? "",
  /** Hugging Face Inference Router (OpenAI-compatible). */
  hfToken: process.env.HF_TOKEN ?? "",
  hfBaseUrl: env("HF_BASE_URL", "https://router.huggingface.co/v1").replace(
    /\/$/,
    "",
  ),
  hfChatModel: env("HF_CHAT_MODEL", "Qwen/Qwen3.8-27B:featherless-ai"),
  /** Optional faster model for ID OCR; defaults to hfChatModel when unset. */
  hfOcrModel: env("HF_OCR_MODEL", ""),
  /** Optional dedicated vision model fallback for ID OCR (HF chat model handles images too). */
  hfVisionModel: env(
    "HF_VISION_MODEL",
    "Qwen/Qwen3-VL-30B-A3B-Instruct:fastest",
  ),
  whatsappAccessToken: env("WHATSAPP_ACCESS_TOKEN"),
  whatsappPhoneNumberId: env("WHATSAPP_PHONE_NUMBER_ID"),
  whatsappWabaId: env("WHATSAPP_WABA_ID"),
  whatsappVerifyToken:
    env("WHATSAPP_VERIFY_TOKEN") || env("WHATSAPP_WEBHOOK_VERIFY_TOKEN"),
  whatsappAppSecret: env("WHATSAPP_APP_SECRET"),
  whatsappApiVersion: env("WHATSAPP_API_VERSION", "v21.0"),
  /**
   * Optional default 6-digit PIN for Meta Cloud API /register when a row has no
   * twoStepPin. Prefer per-number PIN generated at registration.
   */
  whatsappTwoStepPin: env("WHATSAPP_TWO_STEP_PIN", "").replace(/\D/g, "").slice(0, 6),
  /**
   * GlucoGuide platform WhatsApp line — OTP / login only (not clinic bot lines).
   * Default: +91 99900 52082 / Meta phone number id 1378039178715653.
   */
  glucoguideOtpPhone: env("GLUCOGUIDE_OTP_PHONE", "9990052082").replace(
    /\D/g,
    "",
  ),
  glucoguideOtpPhoneNumberId: env(
    "GLUCOGUIDE_OTP_PHONE_NUMBER_ID",
    env("WHATSAPP_PHONE_NUMBER_ID", "1378039178715653"),
  ),
  /** Dev/QA: include OTP code in API JSON when WhatsApp send is simulated or this is set. */
  qaExposeOtp:
    env("QA_EXPOSE_OTP", "") === "1" ||
    env("QA_DISABLE_RATE_LIMIT", "") === "1",
  /** Meta app for Embedded Signup (doctor self-serve WhatsApp connect). */
  metaAppId: env("META_APP_ID"),
  metaAppSecret: env("META_APP_SECRET"),
  metaEmbeddedSignupConfigId: env("META_EMBEDDED_SIGNUP_CONFIG_ID"),
  /** Optional: whatsapp_business_app_onboarding for coexistence flow. */
  metaEmbeddedSignupFeature: env("META_EMBEDDED_SIGNUP_FEATURE"),
  razorpayKeyId: env("RAZORPAY_KEY_ID"),
  razorpayKeySecret: env("RAZORPAY_KEY_SECRET"),
  razorpayWebhookSecret: env("RAZORPAY_WEBHOOK_SECRET"),
  port: Number(process.env.PORT ?? 3001),
};

export const origins = settings.frontendOrigins
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

/** First configured frontend origin — used for OAuth redirects. */
export const frontendBaseUrl =
  origins[0]?.replace(/\/$/, "") || "http://localhost:3000";

export const databaseUrl =
  process.env.DATABASE_URL ??
  `postgresql://${settings.postgresUser}:${settings.postgresPass}@${settings.postgresHost}:${settings.postgresPort}/${settings.postgresDatabaseName}`;

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = databaseUrl;
}

export const redisUrl = `redis://${settings.redisHost}:${settings.redisPort}`;
