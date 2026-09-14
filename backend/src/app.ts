import express, { type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { origins } from "./config/index.js";
import { rateLimiter } from "./middleware/rateLimiter.js";
import { errorHandler } from "./middleware/auth.js";
import apiRouter from "./routes/index.js";

const app = express();

app.set("trust proxy", 1);

app.use(
  cors({
    origin: origins,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Hub-Signature-256",
      "X-Razorpay-Signature",
    ],
  }),
);

app.use(cookieParser());

function attachRawJsonBody(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  const raw = req.body as Buffer;
  (req as Request & { rawBody?: string }).rawBody = raw?.toString?.() ?? "";
  try {
    req.body = JSON.parse((req as Request & { rawBody?: string }).rawBody ?? "{}");
  } catch {
    req.body = {};
  }
  next();
}

app.use(
  "/api/v1/procto/whatsapp/webhook",
  express.raw({ type: "application/json" }),
  attachRawJsonBody,
);

app.use(
  "/api/v1/procto/billing/razorpay-webhook",
  express.raw({ type: "application/json" }),
  attachRawJsonBody,
);

app.use(express.json({ limit: "10mb" }));
app.use(rateLimiter);

const uploadRoot = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../uploads",
);
app.use("/api/v1/uploads", express.static(uploadRoot));

app.use("/api/v1", apiRouter);

app.get("/health", (_req, res) => {
  res.status(200).json({ ok: true, service: "glucoguide-api" });
});

app.get("/api/v1/health", (_req, res) => {
  res.status(200).json({ ok: true, service: "glucoguide-api" });
});

app.use(errorHandler);

export default app;
