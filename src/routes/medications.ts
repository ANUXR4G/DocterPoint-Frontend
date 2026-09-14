import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { MedicationService } from "../services/medication.js";
import { requireAuth } from "../middleware/auth.js";
import { getRedis } from "../db/redis.js";

const router = Router();

router.get(
  "/suggestions",
  requireAuth("patient:read", "medication:read"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await MedicationService.getPatientMedications(
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
  "/generate",
  requireAuth("patient:read", "medication:read", "medication:write"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await MedicationService.generateBySystem(
        req.body,
        req.sessionUser!,
        getRedis(),
      );
      return res.json(result);
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  "/appointment",
  requireAuth("patient:read", "appointment:read", "medication:read"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await MedicationService.appointmentMedicationById(
        String(req.query.id),
        getRedis(),
      );
      return res.json(result);
    } catch (error) {
      next(error);
    }
  },
);

router.put(
  "/suggestions",
  requireAuth("patient:read", "medication:read", "medication:update"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await MedicationService.updatePatientMedications(
        req.body,
        req.sessionUser!,
        req.query.id as string | undefined,
        getRedis(),
      );
      return res.json(result);
    } catch (error) {
      next(error);
    }
  },
);

router.delete(
  "/appointment",
  requireAuth(
    "patient:read",
    "appointment:read",
    "medication:read",
    "medication:delete",
  ),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await MedicationService.deletePatientMedications(
        req.sessionUser!,
        String(req.query.id),
        getRedis(),
      );
      return res.json(result);
    } catch (error) {
      next(error);
    }
  },
);

export default router;
