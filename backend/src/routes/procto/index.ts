import { Router } from "express";
import practicesRouter from "./practices.js";
import bookingsRouter from "./bookings.js";
import whatsappRouter from "./whatsapp.js";
import adminRouter from "./admin.js";
import billingWebhookRouter from "./billingWebhook.js";

const router = Router();

router.use("/practices", practicesRouter);
router.use("/bookings", bookingsRouter);
router.use("/whatsapp", whatsappRouter);
router.use("/admin", adminRouter);
router.use("/billing/razorpay-webhook", billingWebhookRouter);

export default router;
