import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { ResponseHandler } from "../core/response.js";
import { attachSessionIfPresent } from "../middleware/auth.js";
import { AssistantService } from "../services/assistant.service.js";
import { AssistantHistoryService } from "../services/assistant.history.service.js";
import {
  isSttConfigured,
  transcribeAudio,
} from "../services/procto/whatsapp.client.js";

const router = Router();
const MAX_SPEECH_BYTES = 2 * 1024 * 1024;

router.get("/status", (_req: Request, res: Response) => {
  return res.json({
    status: "successful",
    message: "assistant status",
    data: {
      available: AssistantService.available(),
      mode: "qa",
      speechServer: isSttConfigured(),
    },
  });
});

router.get(
  "/conversations",
  attachSessionIfPresent(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.sessionUser?.id) {
        return ResponseHandler.fetchSuccessful(res, "ok", [], 0);
      }
      const data = await AssistantHistoryService.list(req.sessionUser.id);
      return ResponseHandler.fetchSuccessful(res, "ok", data, data.length);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/conversations",
  attachSessionIfPresent(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.sessionUser?.id) {
        return ResponseHandler.unsuccessful(
          res,
          401,
          "Sign in to save Mira chats.",
        );
      }
      const title =
        typeof req.body?.title === "string" ? req.body.title : undefined;
      const data = await AssistantHistoryService.create(
        req.sessionUser.id,
        title,
      );
      return ResponseHandler.createSuccessful(res, "created", data);
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  "/conversations/:id",
  attachSessionIfPresent(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.sessionUser?.id) {
        return ResponseHandler.unsuccessful(
          res,
          401,
          "Sign in to view Mira chats.",
        );
      }
      const data = await AssistantHistoryService.get(
        req.sessionUser.id,
        String(req.params.id),
      );
      return ResponseHandler.fetchSuccessful(res, "ok", data);
    } catch (error) {
      next(error);
    }
  },
);

router.delete(
  "/conversations/:id",
  attachSessionIfPresent(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.sessionUser?.id) {
        return ResponseHandler.unsuccessful(
          res,
          401,
          "Sign in to manage Mira chats.",
        );
      }
      await AssistantHistoryService.remove(
        req.sessionUser.id,
        String(req.params.id),
      );
      return ResponseHandler.fetchSuccessful(res, "deleted", { ok: true });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/transcribe",
  attachSessionIfPresent(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!isSttConfigured()) {
        return res.status(503).json({
          status: "unsuccessful",
          message:
            "Server speech transcription is not configured (set OPENAI_API_KEY).",
        });
      }

      const body = req.body as {
        audioBase64?: string;
        mimeType?: string;
      };
      const raw = String(body.audioBase64 ?? "").trim();
      if (!raw) {
        return res.status(400).json({
          status: "unsuccessful",
          message: "audioBase64 is required.",
        });
      }

      const base64 = raw.includes(",") ? (raw.split(",").pop() ?? "") : raw;
      const buffer = Buffer.from(base64, "base64");
      if (!buffer.length) {
        return res.status(400).json({
          status: "unsuccessful",
          message: "Invalid audio payload.",
        });
      }
      if (buffer.length > MAX_SPEECH_BYTES) {
        return res.status(413).json({
          status: "unsuccessful",
          message: "Audio clip is too long. Record a shorter phrase and try again.",
        });
      }

      const mimeType = String(body.mimeType ?? "audio/webm").trim() || "audio/webm";
      const text = await transcribeAudio(buffer, mimeType);
      if (!text) {
        return res.status(422).json({
          status: "unsuccessful",
          message: "Could not transcribe audio. Speak clearly and try again.",
        });
      }

      return ResponseHandler.fetchSuccessful(res, "transcribed", { text });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/chat",
  attachSessionIfPresent(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as {
        message?: string;
        history?: Array<{ role: string; content: string }>;
        conversationId?: string | null;
      };

      const history = Array.isArray(body.history)
        ? body.history
            .filter(
              (m) =>
                m &&
                (m.role === "user" || m.role === "assistant") &&
                typeof m.content === "string",
            )
            .map((m) => ({
              role: m.role as "user" | "assistant",
              content: m.content,
            }))
        : [];

      const userMessage = String(body.message ?? "");
      const result = await AssistantService.chat({
        message: userMessage,
        history,
        userName: req.sessionUser?.name ?? null,
      });

      let conversationId: string | null =
        typeof body.conversationId === "string" && body.conversationId.trim()
          ? body.conversationId.trim()
          : null;
      let title: string | null = null;

      if (req.sessionUser?.id) {
        try {
          const saved = await AssistantHistoryService.appendTurn({
            userId: req.sessionUser.id,
            conversationId,
            userMessage,
            assistantReply: result.reply,
          });
          conversationId = saved.conversationId;
          title = saved.title;
        } catch (persistErr) {
          console.warn("[assistant] history persist failed:", persistErr);
        }
      }

      return ResponseHandler.fetchSuccessful(res, "ok", {
        reply: result.reply,
        provider: result.provider,
        mode: "qa",
        conversationId,
        title,
      });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
