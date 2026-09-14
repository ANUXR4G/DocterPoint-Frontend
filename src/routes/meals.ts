import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { MealService } from "../services/meal.js";
import { requireAuth } from "../middleware/auth.js";
import { getRedis } from "../db/redis.js";

const router = Router();

router.get(
  "/meal",
  requireAuth("patient:read"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await MealService.retrieveAll(
        req.sessionUser!,
        getRedis(),
        req.query.q as string | undefined,
        Number(req.query.page ?? 1),
        Math.min(Number(req.query.limit ?? 10), 100),
        req.query.category as string | undefined,
      );
      return res.json(result);
    } catch (error) {
      next(error);
    }
  },
);

export default router;
