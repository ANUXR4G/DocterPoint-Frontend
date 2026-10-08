import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { ResponseHandler } from "../../core/response.js";
import { requireAuth } from "../../middleware/auth.js";
import { createSpecialty, listSpecialties } from "../../services/procto/specialty.service.js";

const router = Router();

router.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const hasDoctors =
      req.query.has_doctors === "true" || req.query.has_doctors === "1";
    const data = await listSpecialties({ hasDoctors });
    return ResponseHandler.fetchSuccessful(res, "specialties fetched.", data, data.length);
  } catch (error) {
    next(error);
  }
});

router.post(
  "/",
  requireAuth("practice:read"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await createSpecialty(String(req.body?.name ?? ""), req.sessionUser!.id);
      return ResponseHandler.createSuccessful(res, "specialty saved.", data);
    } catch (error) {
      next(error);
    }
  },
);

export default router;
