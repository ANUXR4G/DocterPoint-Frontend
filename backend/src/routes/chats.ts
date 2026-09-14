import { Router } from "express";
import { param } from "../core/params.js";
import type { Request, Response, NextFunction } from "express";
import { ChatService, resolveUserId } from "../services/chat.js";
import { requireAuth } from "../middleware/auth.js";
import { AppError, ResponseHandler } from "../core/response.js";

const router = Router();

router.post(
  "/user/:user_id/help",
  requireAuth("users:chat"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = resolveUserId(param(req.params.user_id));
      if (req.sessionUser!.id !== userId) {
        throw new AppError(403, "Forbidden");
      }
      const content = String(req.body?.content ?? "");
      const result = await ChatService.sendHelpMessage(userId, content);
      return res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  },
);

/** Patient ↔ doctor direct text message (HTTP; also mirrored over WS). */
router.post(
  "/direct",
  requireAuth("users:chat"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const receiverId = String(req.body?.receiverId ?? req.body?.receiver_id ?? "");
      const content = String(req.body?.content ?? "");
      if (!receiverId) {
        throw new AppError(400, "receiverId is required.");
      }
      const result = await ChatService.sendDirectMessage(
        req.sessionUser!.id,
        receiverId,
        content,
      );
      return res.status(201).json({
        status: "successful",
        message: "message sent.",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  "/threads",
  requireAuth("users:chat"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await ChatService.listThreads(req.sessionUser!.id);
      return ResponseHandler.fetchSuccessful(res, "chat threads.", data, data.length);
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  "/user/:user_id",
  requireAuth("users:chat"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = resolveUserId(param(req.params.user_id));
      if (req.sessionUser!.id !== userId) {
        throw new AppError(403, "Forbidden");
      }
      const result = await ChatService.getUserHelpMessages(
        Number(req.query.page ?? 1),
        Math.min(Number(req.query.limit ?? 10), 100),
        userId,
      );
      return res.json(result);
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  "/:user_id/:receiver_id",
  requireAuth("users:chat"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = resolveUserId(param(req.params.user_id));
      const receiverId = resolveUserId(param(req.params.receiver_id));
      if (req.sessionUser!.id !== userId) {
        throw new AppError(403, "Forbidden");
      }
      const result = await ChatService.getUserDirectMessages(
        Number(req.query.page ?? 1),
        Math.min(Number(req.query.limit ?? 50), 100),
        userId,
        receiverId,
      );
      return res.json(result);
    } catch (error) {
      next(error);
    }
  },
);

export default router;
