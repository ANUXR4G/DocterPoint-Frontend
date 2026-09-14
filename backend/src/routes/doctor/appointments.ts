import { Router } from "express";
import { param } from "../../core/params.js";
import type { Request, Response, NextFunction } from "express";
import { AppointmentService } from "../../services/doctor/appointments.js";
import { PatientService } from "../../services/doctor/patients.js";
import { requireAuth } from "../../middleware/auth.js";
import { getRedis } from "../../db/redis.js";

const router = Router();

router.get(
  "/appointments",
  requireAuth("doctor:read", "doctor:update", "patient:read"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await AppointmentService.getAppointments(
        req.sessionUser!,
        getRedis(),
        Number(req.query.status ?? 1),
        String(req.query.date ?? "latest"),
        req.query.q as string | undefined,
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
  "/appointments/info/:id",
  requireAuth("doctor:read", "doctor:update", "patient:read"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await AppointmentService.getInfo(
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
  "/appointments/info/:id",
  requireAuth(
    "patient:read",
    "medication:read",
    "medication:update",
    "appointment:read",
    "appointment:update",
  ),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await AppointmentService.updateInfo(
        param(req.params.id),
        req.sessionUser!,
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
  "/appointments/requested",
  requireAuth("doctor:read", "doctor:update", "patient:read"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await AppointmentService.getRequests(req.sessionUser!);
      return res.json(result);
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  "/appointments/patient/:patient_id",
  requireAuth("doctor:read", "doctor:update", "patient:read", "appointment:read"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await PatientService.getPatientAppointments(
        param(req.params.patient_id),
        req.sessionUser!,
      );
      return res.json(result);
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  "/:doctor_id/appointments/today",
  requireAuth("doctor:read", "doctor:update", "patient:read", "appointment:read"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await AppointmentService.getAppointmentsToday(
        param(req.params.doctor_id),
        req.sessionUser!,
      );
      return res.json(result);
    } catch (error) {
      next(error);
    }
  },
);

export default router;
