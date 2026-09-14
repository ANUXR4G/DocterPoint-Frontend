import { Router } from "express";
import { param } from "../../core/params.js";
import type { Request, Response, NextFunction } from "express";
import { DoctorService } from "../../services/public.js";
import { getRedis } from "../../db/redis.js";

const router = Router();

function parseList(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (Array.isArray(value)) return value.map(String);
  return [String(value)];
}

router.get("/info", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await DoctorService.getAllDoctors(
      getRedis(),
      req.query.q as string | undefined,
      Number(req.query.page ?? 1),
      Math.min(Number(req.query.limit ?? 10), 100),
      parseList(req.query.hospitals),
      parseList(req.query.locations),
      req.query.experience ? Number(req.query.experience) : undefined,
    );
    return res.json(result);
  } catch (error) {
    next(error);
  }
});

router.get("/:id/info", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await DoctorService.getDoctorById(param(req.params.id), getRedis());
    return res.json(result);
  } catch (error) {
    next(error);
  }
});

router.get("/hospital", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await DoctorService.getDoctorsByHospitalId(
      String(req.query.id),
      getRedis(),
      Number(req.query.page ?? 1),
      Math.min(Number(req.query.limit ?? 10), 100),
    );
    return res.json(result);
  } catch (error) {
    next(error);
  }
});

export default router;
