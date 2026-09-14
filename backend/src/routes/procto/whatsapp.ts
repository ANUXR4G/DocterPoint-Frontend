import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { settings } from "../../config/index.js";
import { ResponseHandler } from "../../core/response.js";
import { WhatsAppService } from "../../services/procto/whatsapp.service.js";
import { verifyMetaWebhookSignature } from "../../services/procto/whatsapp.client.js";
import { param } from "../../core/params.js";
import { prisma } from "../../db/prisma.js";

const router = Router();

/** Meta Cloud API webhook verification (GET). */
router.get("/webhook", (req: Request, res: Response) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === settings.whatsappVerifyToken) {
    return res.status(200).send(challenge);
  }

  return res.status(403).send("Forbidden");
});

/** Meta Cloud API inbound messages (POST). */
router.post("/webhook", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rawBody = (req as Request & { rawBody?: string }).rawBody ?? JSON.stringify(req.body);
    const signature = req.headers["x-hub-signature-256"] as string | undefined;

    if (!verifyMetaWebhookSignature(rawBody, signature)) {
      return res.status(401).send("Invalid signature");
    }

    res.status(200).send("EVENT_RECEIVED");

    void WhatsAppService.processMetaWebhook(req.body).catch((err) =>
      console.error("WhatsApp webhook processing error:", err),
    );
  } catch (error) {
    next(error);
  }
});

/** Legacy/simple JSON webhook for local testing (text or voice → STT → bot). */
router.post("/webhook/test", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { from, to, body, type, transcribedText, audioBase64, mimeType } =
      req.body ?? {};

    let messageType: "text" | "audio" =
      type === "audio" || audioBase64 ? "audio" : "text";
    let transcript: string | undefined =
      typeof transcribedText === "string" ? transcribedText : undefined;

    if (messageType === "audio" && !transcript && audioBase64) {
      const { transcribeAudio } = await import(
        "../../services/procto/whatsapp.client.js"
      );
      const buffer = Buffer.from(String(audioBase64), "base64");
      transcript =
        (await transcribeAudio(buffer, mimeType || "audio/ogg")) ?? undefined;
    }

    const result = await WhatsAppService.handleInboundMessage({
      from,
      to,
      body: body ?? transcript ?? "",
      messageType,
      transcribedText: transcript,
    });
    return res.json({
      reply: result.reply,
      transcribedText: transcript ?? null,
      messageType,
    });
  } catch (error) {
    next(error);
  }
});

router.post("/webhook/:practiceId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const practice = await prisma.practice.findUnique({
      where: { id: param(req.params.practiceId) },
    });
    if (!practice) {
      return ResponseHandler.unsuccessful(res, 404, "practice not found.");
    }
    if (
      !WhatsAppService.verifyWebhook(
        practice.whatsappWebhookSecret ?? undefined,
        req.headers["x-webhook-secret"] as string,
      )
    ) {
      return ResponseHandler.unsuccessful(res, 401, "invalid webhook secret.");
    }

    const { from, body, type, transcribedText } = req.body;
    const result = await WhatsAppService.handleInboundMessage({
      from,
      to: practice.whatsappBusinessNumber ?? "",
      body: body ?? "",
      messageType: type === "audio" ? "audio" : "text",
      transcribedText,
    });
    return res.json({ reply: result.reply });
  } catch (error) {
    next(error);
  }
});

export default router;
