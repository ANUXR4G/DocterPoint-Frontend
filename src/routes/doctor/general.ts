import { Router } from "express";
import { param } from "../../core/params.js";
import type { Request, Response, NextFunction } from "express";
import { DoctorService } from "../../services/doctor/general.js";
import { PatientService } from "../../services/doctor/patients.js";
import { requireAuth } from "../../middleware/auth.js";
import { getRedis } from "../../db/redis.js";

const router = Router();

router.get(
  "/info",
  requireAuth("doctor:read", "doctor:update"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await DoctorService.getInfo(req.sessionUser!, getRedis());
      return res.json(result);
    } catch (error) {
      next(error);
    }
  },
);

router.patch(
  "/theme",
  requireAuth("doctor:read", "doctor:update"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const bgSrc =
        req.body?.bgSrc !== undefined
          ? req.body.bgSrc
          : req.body?.bg_src !== undefined
            ? req.body.bg_src
            : undefined;
      const textSize =
        req.body?.textSize !== undefined
          ? req.body.textSize
          : req.body?.text_size !== undefined
            ? req.body.text_size
            : undefined;
      if (bgSrc === undefined && textSize === undefined) {
        return res.status(400).json({
          status: "unsuccessful",
          message:
            "Provide bgSrc and/or textSize (small | medium | large).",
        });
      }
      const result = await DoctorService.updateThemePreferences(
        req.sessionUser!,
        { bgSrc, textSize },
        getRedis(),
      );
      return res.json({
        status: "successful",
        message: "appearance preferences updated.",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  "/:doctor_id/patients",
  requireAuth("doctor:read", "doctor:update", "patient:read"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await PatientService.getPatients(
        param(req.params.doctor_id),
        req.sessionUser!,
        getRedis(),
        req.query.q as string | undefined,
        req.query.age as string | undefined,
        req.query.gender as string | undefined,
        Number(req.query.page ?? 1),
        Math.min(Number(req.query.limit ?? 10), 100),
      );
      return res.json(result);
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  "/:doctor_id/analytics",
  requireAuth(
    "doctor:read",
    "doctor:analytics",
    "doctor:update",
    "patient:read",
  ),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await DoctorService.getAnalytics(
        param(req.params.doctor_id),
        req.sessionUser!,
        String(req.query.type ?? "week"),
      );
      return res.json(result);
    } catch (error) {
      next(error);
    }
  },
);

export default router;
