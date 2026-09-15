import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import type { Response } from "express";
import { settings, origins } from "../config/index.js";
import { AppError } from "./response.js";
import { scopes } from "./utils.js";
import type { SessionUser } from "../types/index.js";

export { origins };

export async function generateHash(text: string): Promise<string> {
  const salt = await bcrypt.genSalt();
  return bcrypt.hash(text, salt);
}

export async function verifyPassword(
  plainPassword: string,
  hashedPassword: string,
): Promise<boolean> {
  return bcrypt.compare(plainPassword, hashedPassword);
}

export function encrypt(
  plainText: string,
  key = settings.hashingSecretKey,
): string {
  const secretKey = Buffer.from(key, "base64");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", secretKey, iv);
  const encrypted = Buffer.concat([
    cipher.update(plainText, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, encrypted, tag]).toString("base64");
}

export function decrypt(
  encryptedText: string,
  key = settings.hashingSecretKey,
): string {
  try {
    const secretKey = Buffer.from(key, "base64");
    const encryptedData = Buffer.from(encryptedText, "base64");
    // AES-GCM payload is at least iv(12) + tag(16) + 1 byte ciphertext
    if (encryptedData.length < 29) {
      throw new Error("ciphertext too short");
    }
    const iv = encryptedData.subarray(0, 12);
    const tag = encryptedData.subarray(encryptedData.length - 16);
    const ciphertext = encryptedData.subarray(12, encryptedData.length - 16);
    const decipher = createDecipheriv("aes-256-gcm", secretKey, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);
    return decrypted.toString("utf8");
  } catch (error) {
    throw new Error(`decryption failed ${String(error)}`);
  }
}

/** Prefer AES-GCM ciphertext from the client; fall back to plaintext (e.g. API tools). */
export function unwrapPassword(password: string): string {
  try {
    return decrypt(password);
  } catch {
    return password;
  }
}

export function uuidToBase64(uuidValue: string): string {
  const hex = uuidValue.replace(/-/g, "");
  const bytes = Buffer.from(hex, "hex");
  return bytes.toString("base64url").replace(/=+$/, "");
}

export function base64ToUuid(base64Str: string): string {
  const padding = "=".repeat((4 - (base64Str.length % 4)) % 4);
  const base64Bytes = Buffer.from(base64Str + padding, "base64url");
  const hex = base64Bytes.toString("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}

export interface TokenPayload {
  sub: string;
  scopes: string[];
  /** Present on tokens issued after perf JWT enrichment — enables DB-free auth. */
  role?: string;
  email?: string;
  name?: string | null;
  imgSrc?: string | null;
  iat?: number;
  exp?: number;
}

export function createAccessToken(data: TokenPayload, expiresAt: Date): string {
  const payload = {
    ...data,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(expiresAt.getTime() / 1000),
  };
  return jwt.sign(payload, settings.jwtSecretKey, {
    algorithm: settings.jwtAlgorithm,
  });
}

export function decodeToken(token: string): TokenPayload {
  try {
    return jwt.verify(token, settings.jwtSecretKey, {
      algorithms: [settings.jwtAlgorithm],
    }) as TokenPayload;
  } catch {
    throw invalidTokenError();
  }
}

export function invalidTokenError(message = "invalid token.") {
  return new AppError(401, message, { "WWW-Authenticate": "Bearer" });
}

export function getUserToken(
  user: SessionUser,
  status = 200,
  redirectUrl?: string,
): { responseBody: Record<string, unknown>; cookies: TokenCookies; redirect?: string } {
  const tokenScopes = scopes[user.role] ?? [];
  const payload: TokenPayload = {
    sub: user.id,
    scopes: tokenScopes,
    role: user.role,
    email: user.email,
    name: user.name ?? null,
    imgSrc: user.imgSrc ?? null,
  };

  const accessTokenExpires = new Date(
    Date.now() +
      (15 + settings.accessTokenExpires) * 60 * 1000,
  );
  const refreshTokenExpires = new Date(
    Date.now() +
      (15 + settings.refreshTokenExpires * 24 * 60) * 60 * 1000,
  );

  const accessToken = createAccessToken(payload, accessTokenExpires);
  const refreshToken = createAccessToken(payload, refreshTokenExpires);
  const userId = uuidToBase64(user.id);

  const cookies: TokenCookies = {
    accessToken,
    refreshToken,
    accessTokenExpires,
    refreshTokenExpires,
  };

  if (redirectUrl) {
    return { responseBody: {}, cookies, redirect: redirectUrl };
  }

  return {
    responseBody: {
      id: userId,
      name: user.name,
      email: user.email,
      role: user.role,
      access_token: cookies.accessToken,
      refresh_token: cookies.refreshToken,
      token: cookies.accessToken,
    },
    cookies,
    redirect: undefined,
  };
}

export interface TokenCookies {
  accessToken: string;
  refreshToken: string;
  accessTokenExpires: Date;
  refreshTokenExpires: Date;
}

export function setTokenCookies(res: Response, cookies: TokenCookies): void {
  const isProduction = process.env.NODE_ENV === "production";
  const cookieOptions = {
    path: "/",
    secure: isProduction,
    sameSite: "lax" as const,
    httpOnly: false,
  };

  res.cookie("access_token", cookies.accessToken, {
    ...cookieOptions,
    expires: cookies.accessTokenExpires,
  });
  res.cookie("refresh_token", cookies.refreshToken, {
    ...cookieOptions,
    expires: cookies.refreshTokenExpires,
  });
}

export function clearTokenCookies(res: Response): void {
  const isProduction = process.env.NODE_ENV === "production";
  const cookieOptions = {
    secure: isProduction,
    sameSite: "lax" as const,
    httpOnly: false,
    path: "/",
  };

  res.clearCookie("access_token", cookieOptions);
  res.clearCookie("refresh_token", cookieOptions);
}

export function extractTokenFromRequest(
  authorization?: string,
  cookies?: Record<string, string>,
): string | undefined {
  if (authorization?.startsWith("Bearer ")) {
    const bearer = authorization.slice("Bearer ".length).trim();
    if (bearer) return bearer;
  }
  return cookies?.access_token;
}
