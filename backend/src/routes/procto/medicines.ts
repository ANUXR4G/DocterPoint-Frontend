import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { ResponseHandler } from "../../core/response.js";
import { requireAuth } from "../../middleware/auth.js";
import { MedicineService } from "../../services/procto/medicine.service.js";

const router = Router();

/**
 * GET /api/v1/procto/medicines
 * Lists medicines with search, filtering by code, brand, generic, or govt code, and favourite flag.
 */
router.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = typeof req.query.q === "string" ? req.query.q : undefined;
    const favouriteOnly =
      req.query.favourite === "true" || req.query.favourite === "1";
    const userId = req.sessionUser?.id;

    const items = await MedicineService.listMedicines({
      userId,
      q,
      favouriteOnly,
    });

    return ResponseHandler.fetchSuccessful(
      res,
      "medicines fetched successfully.",
      items,
      items.length,
    );
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/procto/medicines
 * Creates a new medicine in the practice's database.
 */
router.post(
  "/",
  requireAuth("practice:write"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const created = await MedicineService.createMedicine(
        req.sessionUser!.id,
        req.body,
      );
      return ResponseHandler.createSuccessful(
        res,
        "medicine created successfully.",
        created,
      );
    } catch (error) {
      next(error);
    }
  },
);

/**
 * PUT /api/v1/procto/medicines/:id
 * Updates an existing medicine.
 */
router.put(
  "/:id",
  requireAuth("practice:write"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const updated = await MedicineService.updateMedicine(
        req.sessionUser!.id,
        id,
        req.body,
      );
      return ResponseHandler.fetchSuccessful(
        res,
        "medicine updated successfully.",
        updated,
      );
    } catch (error) {
      next(error);
    }
  },
);

/**
 * DELETE /api/v1/procto/medicines/:id
 * Deletes a medicine.
 */
router.delete(
  "/:id",
  requireAuth("practice:write"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      await MedicineService.deleteMedicine(req.sessionUser!.id, id);
      return ResponseHandler.fetchSuccessful(
        res,
        "medicine deleted successfully.",
        { id },
      );
    } catch (error) {
      next(error);
    }
  },
);

/**
 * PATCH /api/v1/procto/medicines/:id/favourite
 * Toggles or sets favourite status for a medicine.
 */
router.patch(
  "/:id/favourite",
  requireAuth("practice:write"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const updated = await MedicineService.toggleFavourite(
        req.sessionUser!.id,
        id,
        req.body?.favourite,
      );
      return ResponseHandler.fetchSuccessful(
        res,
        "favourite updated successfully.",
        updated,
      );
    } catch (error) {
      next(error);
    }
  },
);

export default router;
