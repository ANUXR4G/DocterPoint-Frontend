import { Router } from "express";
import { param } from "../../core/params.js";
import type { Request, Response, NextFunction } from "express";
import { HospitalService } from "../../services/public.js";
import { getRedis } from "../../db/redis.js";

const router = Router();

function parseList(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (Array.isArray(value)) return value.map(String);
  return [String(value)];
}

router.get("/tags/names", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await HospitalService.getAllNames(getRedis());
    return res.json(result);
  } catch (error) {
    next(error);
  }
});

router.get("/tags/cities", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await HospitalService.getAllLocations(getRedis());
    return res.json(result);
  } catch (error) {
    next(error);
  }
});

router.get("/info", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await HospitalService.getAllHospitals(
      getRedis(),
      req.query.q as string | undefined,
      Number(req.query.page ?? 1),
      Math.min(Number(req.query.limit ?? 10), 100),
      parseList(req.query.locations),
    );
    return res.json(result);
  } catch (error) {
    next(error);
  }
});

router.get("/:id/info", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await HospitalService.getHospitalById(param(req.params.id), getRedis());
    return res.json(result);
  } catch (error) {
    next(error);
  }
});

export default router;
