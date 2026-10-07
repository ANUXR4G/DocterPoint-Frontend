import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { ResponseHandler } from "../../core/response.js";
import { requireAuth, attachSessionIfPresent } from "../../middleware/auth.js";
import { BookingService } from "../../services/procto/booking.service.js";
import { PracticeService } from "../../services/procto/practice.service.js";
import { param } from "../../core/params.js";
import { BookingStatus } from "@prisma/client";
import { prisma } from "../../db/prisma.js";

const router = Router();

/**
 * Public .ics download — UUID is the capability token.
 * Used by WhatsApp confirmation links (phones open this URL).
 */
router.get(
  "/:bookingId/calendar.ics",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const bookingId = param(req.params.bookingId);
      if (
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          bookingId,
        )
      ) {
        return ResponseHandler.unsuccessful(res, 400, "Invalid booking id.");
      }
      const booking = await prisma.practiceBooking.findUnique({
        where: { id: bookingId },
        include: {
          practice: { select: { name: true } },
          location: {
            select: {
              name: true,
              address: true,
              city: true,
              geometry: true,
            },
          },
        },
      });
      if (!booking) {
        return ResponseHandler.unsuccessful(res, 404, "Booking not found.");
      }
      const provider = await prisma.user.findUnique({
        where: { id: booking.providerId },
        select: { name: true },
      });
      const { buildIcsContent, bookingReferenceId } = await import(
        "../../services/procto/bookingCalendar.js"
      );
      const ics = buildIcsContent({
        id: booking.id,
        mode: booking.mode,
        slotStart: booking.slotStart,
        sessionDate: booking.sessionDate,
        tokenNumber: booking.tokenNumber,
        patientName: booking.patientName,
        practiceName: booking.practice.name,
        providerName: provider?.name,
        location: booking.location ?? {},
      });
      const filename = `appointment-${bookingReferenceId(booking.id)}.ics`;
      res.setHeader("Content-Type", "text/calendar; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${filename}"`,
      );
      return res.status(200).send(ics);
    } catch (error) {
      next(error);
    }
  },
);

router.get("/availability", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { practiceId, providerId, locationId, date } = req.query;
    if (!practiceId || !providerId || !locationId || !date) {
      return ResponseHandler.unsuccessful(
        res,
        400,
        "practiceId, providerId, locationId, and date are required.",
      );
    }
    const data = await BookingService.getAvailability(
      String(practiceId),
      String(providerId),
      String(locationId),
      String(date),
    );
    return ResponseHandler.fetchSuccessful(res, "availability fetched.", data);
  } catch (error) {
    next(error);
  }
});

router.post(
  "/walk-in",
  requireAuth("booking:update"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await BookingService.createWalkIn(
        {
          practiceId: String(req.body?.practiceId || ""),
          providerId: String(req.body?.providerId || ""),
          locationId: req.body?.locationId ? String(req.body.locationId) : undefined,
          patientId: req.body?.patientId ? String(req.body.patientId) : undefined,
          patientPhone: String(req.body?.patientPhone || ""),
          disease: req.body?.disease ? String(req.body.disease) : undefined,
        },
        req.sessionUser!.id,
      );
      return ResponseHandler.createSuccessful(res, "walk-in added.", data);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/",
  attachSessionIfPresent(),
  async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = { ...req.body };
    if (!req.sessionUser?.id) {
      return ResponseHandler.unsuccessful(
        res,
        401,
        "Sign in or create an account to book — every visit is saved under your Patient ID (MRN).",
      );
    }
    if (req.sessionUser.role !== "user") {
      const data = await BookingService.createDeskBooking(
        {
          ...body,
          patientId: body.patientId ? String(body.patientId) : undefined,
          patientPhone: String(body.patientPhone || ""),
        },
        req.sessionUser.id,
      );
      return ResponseHandler.createSuccessful(res, "booking created.", data);
    }
    body.patientId = req.sessionUser.id;
    if (!body.patientPhone) {
      const patient = await prisma.patient.findUnique({
        where: { id: req.sessionUser.id },
        select: { contactNumber: true, user: { select: { phone: true, name: true } } },
      });
      body.patientPhone =
        patient?.contactNumber || patient?.user?.phone || body.patientPhone;
      body.patientName =
        body.patientName || patient?.user?.name || undefined;
    }
    if (!body.patientPhone) {
      return ResponseHandler.unsuccessful(
        res,
        400,
        "patientPhone is required to book.",
      );
    }
    if (!String(body.disease || "").trim()) {
      return ResponseHandler.unsuccessful(
        res,
        400,
        "Please describe the problem / reason for visit.",
      );
    }
    const data = await BookingService.createBooking(body);
    return ResponseHandler.createSuccessful(res, "booking created.", data);
  } catch (error) {
    next(error);
  }
});

router.get(
  "/mine",
  requireAuth("booking:read"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.sessionUser!.id;
      const patient = await prisma.patient.findUnique({
        where: { id: userId },
        select: { contactNumber: true, user: { select: { phone: true } } },
      });
      const phone =
        (req.query.phone as string | undefined) ||
        patient?.contactNumber ||
        patient?.user?.phone ||
        undefined;

      const data = await BookingService.listForPatient({
        patientId: userId,
        phone,
      });
      return ResponseHandler.fetchSuccessful(res, "bookings fetched.", data);
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  "/practice/:practiceId",
  requireAuth("booking:read"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const practiceId = param(req.params.practiceId);
      const providerId = await PracticeService.resolveDataProviderScope(
        practiceId,
        req.sessionUser!.id,
        req.query.providerId as string | undefined,
      );
      const data = await BookingService.listForPractice(practiceId, {
        date: req.query.date as string | undefined,
        from: req.query.from as string | undefined,
        to: req.query.to as string | undefined,
        providerId,
      });
      return ResponseHandler.fetchSuccessful(res, "practice bookings fetched.", data);
    } catch (error) {
      next(error);
    }
  },
);

router.patch(
  "/:id/cancel",
  requireAuth("booking:write"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.sessionUser!.id;
      const patient = await prisma.patient.findUnique({
        where: { id: userId },
        select: { contactNumber: true, user: { select: { phone: true } } },
      });
      const phone =
        (req.body.phone as string | undefined) ||
        patient?.contactNumber ||
        patient?.user?.phone ||
        undefined;

      const data = await BookingService.cancelByPatient(param(req.params.id), {
        phone,
        patientId: userId,
        reason:
          typeof req.body?.reason === "string" ? req.body.reason : undefined,
      });
      return ResponseHandler.fetchSuccessful(res, "booking canceled.", data);
    } catch (error) {
      next(error);
    }
  },
);

router.patch(
  "/:id/reschedule",
  requireAuth("booking:write"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.sessionUser!.id;
      const patient = await prisma.patient.findUnique({
        where: { id: userId },
        select: { contactNumber: true, user: { select: { phone: true } } },
      });
      const phone =
        (req.body.phone as string | undefined) ||
        patient?.contactNumber ||
        patient?.user?.phone ||
        undefined;

      const data = await BookingService.reschedule(param(req.params.id), {
        slotStart: req.body.slotStart as string | undefined,
        sessionDate: req.body.sessionDate as string | undefined,
        phone,
        patientId: userId,
      });
      return ResponseHandler.fetchSuccessful(res, "booking rescheduled.", data);
    } catch (error) {
      next(error);
    }
  },
);

router.patch(
  "/:id/status",
  requireAuth("booking:update"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const status = req.body.status as BookingStatus;
      if (String(status || "").toUpperCase() === BookingStatus.COMPLETED) {
        return ResponseHandler.unsuccessful(
          res,
          400,
          "Finish the appointment from the visit page (it saves remarks and medicines with it).",
        );
      }
      const data = await BookingService.updateStatus(
        param(req.params.id),
        status,
        req.sessionUser!.id,
      );
      return ResponseHandler.fetchSuccessful(res, "booking updated.", data);
    } catch (error) {
      next(error);
    }
  },
);

router.patch(
  "/:id/visit",
  requireAuth("booking:update"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await BookingService.updateVisit(
        param(req.params.id),
        {
          doctorRemarks: req.body.doctorRemarks,
          medicines: req.body.medicines,
          documents: req.body.documents,
          clinicalAssessment: req.body.clinicalAssessment,
          status: req.body.status as BookingStatus | undefined,
        },
        req.sessionUser!.id,
      );
      return ResponseHandler.fetchSuccessful(res, "visit details saved.", data);
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  "/:id/general-documents",
  requireAuth("booking:read"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await BookingService.listGeneralDocuments(
        param(req.params.id),
        req.sessionUser!.id,
      );
      return ResponseHandler.fetchSuccessful(res, "general documents fetched.", data);
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  "/:id/payment",
  requireAuth("booking:read"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = param(req.params.id);
      const found = await prisma.practiceBooking.findUnique({
        where: { id },
        select: {
          practiceId: true,
          providerId: true,
          practice: {
            select: {
              consultationFee: true,
              advanceBookingAmount: true,
              razorpayKeyId: true,
              razorpayKeySecretEnc: true,
            },
          },
        },
      });
      if (!found) return ResponseHandler.unsuccessful(res, 404, "booking not found.");
      await PracticeService.assertCanViewBooking(
        found.practiceId,
        req.sessionUser!.id,
        found.providerId,
      );
      const [
        { BookingPaymentService, paymentView, prepayAmountPaise },
        { PaymentRequestService },
        { practicePaymentsEnabled },
      ] = await Promise.all([
        import("../../services/procto/bookingPayment.service.js"),
        import("../../services/procto/paymentRequest.service.js"),
        import("../../services/procto/paymentAccount.service.js"),
      ]);
      const booking =
        req.query.refresh === "1"
          ? await BookingPaymentService.refresh(id)
          : await prisma.practiceBooking.findUniqueOrThrow({ where: { id } });
      return ResponseHandler.fetchSuccessful(res, "payment fetched.", {
        ...paymentView(booking),
        clinicFee: prepayAmountPaise(found.practice.consultationFee),
        advanceAmount: prepayAmountPaise(found.practice.advanceBookingAmount),
        requests: await PaymentRequestService.listForBooking(id),
        paymentsEnabled: practicePaymentsEnabled(found.practice),
      });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/:id/general-documents",
  requireAuth("booking:update"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await BookingService.addGeneralDocument(
        param(req.params.id),
        { name: req.body?.name, url: req.body?.url },
        req.sessionUser!.id,
      );
      return ResponseHandler.fetchSuccessful(res, "general document saved.", data);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/:id/share-document",
  requireAuth("booking:update"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await BookingService.shareDocumentWithPatient(
        param(req.params.id),
        {
          name: req.body?.name,
          url: req.body?.url,
          caption: req.body?.caption,
        },
        req.sessionUser!.id,
      );
      return ResponseHandler.fetchSuccessful(res, "document shared.", data);
    } catch (error) {
      next(error);
    }
  },
);

/** Finished visit: re-send clinic log / prescription summary on patient WhatsApp. */
router.post(
  "/:id/send-clinic-log",
  requireAuth("booking:update"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await BookingService.sendClinicLogWhatsApp(
        param(req.params.id),
        req.sessionUser!.id,
      );
      return ResponseHandler.fetchSuccessful(
        res,
        "clinic log queued for WhatsApp.",
        data,
      );
    } catch (error) {
      next(error);
    }
  },
);

/** Patient attaches a file to their own visit + care chat (app / portal). */
router.post(
  "/:id/patient-document",
  requireAuth("booking:write"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await BookingService.attachPatientDocument(
        param(req.params.id),
        {
          name: req.body?.name,
          url: req.body?.url,
          caption: req.body?.caption,
        },
        req.sessionUser!.id,
      );
      return ResponseHandler.fetchSuccessful(res, "document attached.", data);
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  "/:id",
  attachSessionIfPresent(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await BookingService.getById(param(req.params.id));
      const user = req.sessionUser;
      let allowedFull = false;
      if (user) {
        if (data.patientId && data.patientId === user.id) {
          allowedFull = true;
        } else {
          try {
            await PracticeService.assertCanViewBooking(
              data.practiceId,
              user.id,
              data.providerId,
            );
            allowedFull = true;
          } catch {
            allowedFull = false;
          }
        }
      }

      let reviewEligibility: Awaited<
        ReturnType<
          typeof import("../../services/procto/review.service.js").ReviewService.getBookingReviewEligibility
        >
      > | null = null;

      if (allowedFull && user) {
        const patient = await prisma.patient.findUnique({
          where: { id: user.id },
          select: { contactNumber: true, user: { select: { phone: true } } },
        });
        const { ReviewService } = await import(
          "../../services/procto/review.service.js"
        );
        reviewEligibility = await ReviewService.getBookingReviewEligibility(
          param(req.params.id),
          {
            userId: user.id,
            phone: patient?.contactNumber || patient?.user?.phone || undefined,
          },
        );
      }

      if (!allowedFull) {
        const { patientPhone: _phone, ...publicView } = data as typeof data & {
          patientPhone?: string;
        };
        return ResponseHandler.fetchSuccessful(res, "booking fetched.", {
          ...publicView,
          patientPhone: data.patientPhone
            ? `${String(data.patientPhone).slice(0, 2)}******`
            : undefined,
        });
      }
      return ResponseHandler.fetchSuccessful(res, "booking fetched.", {
        ...data,
        reviewEligibility,
      });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
