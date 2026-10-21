import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { ResponseHandler } from "../../core/response.js";
import { requireAuth } from "../../middleware/auth.js";
import { OrderSetService } from "../../services/procto/orderset.service.js";

const router = Router();

/**
 * GET /api/v1/procto/order-sets
 * Lists order sets available for the practice.
 */
router.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const practiceId =
      typeof req.query.practiceId === "string" ? req.query.practiceId : undefined;
    const userId = req.sessionUser?.id;

    let targetPracticeId = practiceId;
    if (!targetPracticeId && userId) {
      targetPracticeId = (await OrderSetService.getPracticeIdForUser(userId)) ?? undefined;
    }

    const orderSets = await OrderSetService.listOrderSets(targetPracticeId);

    return ResponseHandler.fetchSuccessful(
      res,
      "order sets fetched successfully.",
      orderSets,
      orderSets.length,
    );
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/procto/order-sets
 * Creates a new custom order set for a clinic.
 */
router.post(
  "/",
  requireAuth("practice:write"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const doctorUserId = req.sessionUser!.id;
      const doctorName = req.sessionUser?.name || "Doctor";
      let practiceId =
        typeof req.body?.practiceId === "string" ? req.body.practiceId : undefined;

      if (!practiceId) {
        practiceId = (await OrderSetService.getPracticeIdForUser(doctorUserId)) ?? undefined;
      }
      if (!practiceId) {
        return ResponseHandler.unsuccessful(
          res,
          400,
          "No practice associated with current session.",
        );
      }

      const created = await OrderSetService.createOrderSet(
        practiceId,
        doctorUserId,
        doctorName,
        req.body,
      );

      return ResponseHandler.createSuccessful(
        res,
        "order set created successfully.",
        created,
      );
    } catch (error) {
      next(error);
    }
  },
);

/**
 * DELETE /api/v1/procto/order-sets/:id
 * Deletes a custom order set.
 */
router.delete(
  "/:id",
  requireAuth("practice:write"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const doctorUserId = req.sessionUser!.id;
      const orderSetId = String(req.params.id);
      let practiceId =
        typeof req.query.practiceId === "string" ? req.query.practiceId : undefined;

      if (!practiceId) {
        practiceId = (await OrderSetService.getPracticeIdForUser(doctorUserId)) ?? undefined;
      }
      if (!practiceId) {
        return ResponseHandler.unsuccessful(
          res,
          400,
          "No practice associated with current session.",
        );
      }

      await OrderSetService.deleteOrderSet(practiceId, orderSetId);

      return ResponseHandler.fetchSuccessful(res, "order set deleted successfully.", {
        deleted: true,
      });
    } catch (error) {
      next(error);
    }
  },
);

export default router;

