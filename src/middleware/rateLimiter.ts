import type { NextFunction, Request, Response } from "express";
import { decodeToken, extractTokenFromRequest } from "../core/security.js";
import { AppError } from "../core/response.js";

const rateLimitData: Record<string, number[]> = {};
const burstControlData: Record<string, number[]> = {};

const BURST_LIMIT_PUBLIC = 200
const BURST_LIMIT_USER = 400
const BURST_WINDOW = 10

const RATE_LIMIT_CONFIG = {
  public: { rateLimit: 300, timeWindow: 60 },
  user: { rateLimit: 600, timeWindow: 60 },
};

export function rateLimiter(req: Request, _res: Response, next: NextFunction): void {
  // Local QA / automated suites hit many public endpoints in a burst.
  if (
    process.env.QA_DISABLE_RATE_LIMIT === "1" ||
    process.env.NODE_ENV === "test"
  ) {
    next();
    return;
  }

  const path = req.path || "";
  const isAuthRefresh =
    path.includes("/auth/token/refresh") || path.endsWith("/token/refresh");

  // Never rate-limit refresh — many client hooks call it on mount.
  if (isAuthRefresh) {
    next();
    return;
  }

  // Meta Cloud API webhooks share egress IPs and send status bursts —
  // rate-limiting them drops patient replies (e.g. MALE after ID OCR).
  if (
    path.includes("/procto/whatsapp/webhook") ||
    path.includes("/procto/billing/razorpay-webhook")
  ) {
    next();
    return;
  }

  const clientIp = req.ip ?? req.socket.remoteAddress ?? "unknown";
  const currentTime = Date.now() / 1000;
  const bearer = req.headers.authorization;

  let config = RATE_LIMIT_CONFIG.public;
  if (bearer) {
    try {
      const token = extractTokenFromRequest(bearer);
      if (token) {
        decodeToken(token);
        config = RATE_LIMIT_CONFIG.user;
      }
    } catch {
      // Invalid bearer tokens fall through to public limits.
    }
  }

  const { rateLimit, timeWindow } = config;
  const burstLimit =
    config === RATE_LIMIT_CONFIG.user ? BURST_LIMIT_USER : BURST_LIMIT_PUBLIC;

  if (!rateLimitData[clientIp]) rateLimitData[clientIp] = [];
  if (!burstControlData[clientIp]) burstControlData[clientIp] = [];

  burstControlData[clientIp] = burstControlData[clientIp].filter(
    (timestamp) => currentTime - timestamp < BURST_WINDOW,
  );

  if (burstControlData[clientIp].length > burstLimit) {
    next(new AppError(429, "Burst limit exceeded."));
    return;
  }

  burstControlData[clientIp].push(currentTime);

  rateLimitData[clientIp] = rateLimitData[clientIp].filter(
    (timestamp) => currentTime - timestamp < timeWindow,
  );

  if (rateLimitData[clientIp].length >= rateLimit) {
    next(new AppError(429, "Rate limit exceeded."));
    return;
  }

  rateLimitData[clientIp].push(currentTime);
  next();
}
