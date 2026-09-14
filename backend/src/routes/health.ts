import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { HealthMonitorings } from "../services/health.js";
import { requireAuth } from "../middleware/auth.js";
import { getRedis } from "../db/redis.js";

const router = Router();

router.get(
  "/records",
  requireAuth("patient:read", "monitoring:read"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await HealthMonitorings.getHealthRecordInfo(
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
  "/records/new",
  requireAuth("patient:read", "monitoring:write"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await HealthMonitorings.newHealthRecord(
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

router.put(
  "/records",
  requireAuth("patient:read", "monitoring:read", "monitoring:update"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await HealthMonitorings.updateHealthRecordById(
        req.body,
        String(req.query.id),
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
