import { Router } from "express";
import { param } from "../core/params.js";
import type { Request, Response, NextFunction } from "express";
import { AppointmentService } from "../services/appointment.js";
import { requireAuth } from "../middleware/auth.js";
import { getRedis } from "../db/redis.js";

const router = Router();

router.get(
  "/info",
  requireAuth("appointment:read"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await AppointmentService.getAllAppointments(
        req.query.q as string | undefined,
        Number(req.query.page ?? 1),
        Math.min(Number(req.query.limit ?? 10), 100),
        req.sessionUser!,
        getRedis(),
      );
      return res.json(result);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/new",
  requireAuth("appointment:write"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await AppointmentService.newAppointment(
        req.body,
        req.sessionUser!,
        getRedis(),
      );
      return res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  "/:id/info",
  requireAuth("appointment:read"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await AppointmentService.getAppointmentById(
        param(req.params.id),
        req.sessionUser!,
        getRedis(),
      );
      return res.json(result);
    } catch (error) {
      next(error);
    }
  },
);

router.put(
  "/:id/info",
  requireAuth("appointment:update"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await AppointmentService.updateAppointmentById(
        param(req.params.id),
        req.body,
        getRedis(),
      );
      return res.json(result);
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  "/upcoming",
  requireAuth("appointment:read"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await AppointmentService.getUpcomingAppointments(
        req.sessionUser!,
        getRedis(),
      );
      return res.json(result);
    } catch (error) {
      next(error);
    }
  },
);

export default router;
