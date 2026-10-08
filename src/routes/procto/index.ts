import { Router } from "express";
import practicesRouter from "./practices.js";
import specialtiesRouter from "./specialties.js";
import bookingsRouter from "./bookings.js";
import whatsappRouter from "./whatsapp.js";
import adminRouter from "./admin.js";
import billingWebhookRouter from "./billingWebhook.js";
import paymentsRouter from "./payments.js";

const router = Router();

router.use("/practices", practicesRouter);
router.use("/specialties", specialtiesRouter);
router.use("/bookings", bookingsRouter);
router.use("/whatsapp", whatsappRouter);
router.use("/admin", adminRouter);
router.use("/billing/razorpay-webhook", billingWebhookRouter);
router.use("/payments", paymentsRouter);

export default router;
