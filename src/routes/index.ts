import { Router } from "express";
import { param } from "../core/params.js";
import type { Request, Response, NextFunction } from "express";
import authRouter from "./auth.js";
import doctorsRouter from "./public/doctors.js";
import hospitalsRouter from "./public/hospitals.js";
import patientsRouter from "./patients.js";
import healthRouter from "./health.js";
import appointmentsRouter from "./appointments.js";
import medicationsRouter from "./medications.js";
import mealsRouter from "./meals.js";
import chatsRouter from "./chats.js";
import doctorGeneralRouter from "./doctor/general.js";
import doctorAppointmentsRouter from "./doctor/appointments.js";
import proctoRouter from "./procto/index.js";
import assistantRouter from "./assistant.js";
import billingDemoRouter from "./billingDemo.js";
import { settings } from "../config/index.js";
import { enqueueEmailTask, getEmailTaskStatus } from "../workers/emailQueue.js";

const router = Router();

router.get("/", (_req: Request, res: Response) => {
  return res.json({
    name: "firedev99",
    email: "firethedev@gmail.com",
    about:
      "Gluco Guide is an integrated health monitoring app for diabetic care, featuring separate dashboards for patients, doctors, and admins. It enables doctor bookings, maps to nearby hospitals, real-time health tracking, and AI-powered recommendations for diet, exercise, and lifestyle, ensuring effective diabetes management and wellness.",
  });
});

router.get("/send-email", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const task = await enqueueEmailTask(
      "sauravagun1999@gmail.com",
      "GlucoGuide Email Tasks",
      "Testing SMTP Connection!",
      60000,
    );
    if (!task) {
      return res.status(503).json({
        status: "unsuccessful",
        message: "email queue unavailable (Redis)",
      });
    }
    return res.json({
      status: "successful",
      message: `successfully, sent mail from ${settings.ownerEmail}`,
      tast_id: task.id,
    });
  } catch (error) {
    next(error);
  }
});

router.get("/tasks/:taskId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await getEmailTaskStatus(param(req.params.taskId));
    return res.json(result);
  } catch (error) {
    next(error);
  }
});

router.use("/procto", proctoRouter);
router.use("/assistant", assistantRouter);
router.use("/billing", billingDemoRouter);

router.use("/auth", authRouter);
router.use("/doctors", doctorsRouter);
router.use("/hospitals", hospitalsRouter);
router.use("/patient", patientsRouter);
router.use("/patient/health", healthRouter);
router.use("/patient/appointments", appointmentsRouter);
router.use("/patient/medication", medicationsRouter);
router.use("/diet", mealsRouter);
router.use("/chats", chatsRouter);

const doctorRouter = Router();
doctorRouter.use(doctorGeneralRouter);
doctorRouter.use(doctorAppointmentsRouter);
router.use("/users/doctor", doctorRouter);

export default router;
