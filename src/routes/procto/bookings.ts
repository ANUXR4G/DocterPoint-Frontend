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
  "/",
  attachSessionIfPresent(),
  async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = { ...req.body };
    // Attach logged-in patient when cookie/bearer is present
    if (req.sessionUser?.id && req.sessionUser.role === "user") {
      body.patientId = body.patientId || req.sessionUser.id;
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
