import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { ResponseHandler } from "../../core/response.js";
import { requireAuth } from "../../middleware/auth.js";
import { TemplateService } from "../../services/procto/template.service.js";

const router = Router();

/**
 * GET /api/v1/procto/templates
 * Lists templates visible to the authenticated doctor, filtered by:
 * - Clinic-level (globally visible within the facility)
 * - Specialty-level (accessible to clinicians in that specialty)
 * - Doctor-level (strictly private to the requesting doctor)
 */
router.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const practiceId =
      typeof req.query.practiceId === "string" ? req.query.practiceId : undefined;
    const specialty =
      typeof req.query.specialty === "string" ? req.query.specialty : undefined;
    const doctorUserId = req.sessionUser?.id;

    const templates = await TemplateService.listTemplates({
      practiceId,
      doctorUserId,
      specialty,
    });

    return ResponseHandler.fetchSuccessful(
      res,
      "templates fetched successfully.",
      templates,
      templates.length,
    );
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/procto/templates
 * Saves a new template created by a doctor directly from the consultation UI.
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
        practiceId = (await TemplateService.getPracticeIdForUser(doctorUserId)) ?? undefined;
      }
      if (!practiceId) {
        return ResponseHandler.unsuccessful(
          res,
          400,
          "No practice associated with current session.",
        );
      }

      const created = await TemplateService.createTemplate(
        practiceId,
        doctorUserId,
        doctorName,
        req.body,
      );

      return ResponseHandler.createSuccessful(
        res,
        "template created successfully.",
        created,
      );
    } catch (error) {
      next(error);
    }
  },
);

/**
 * PUT /api/v1/procto/templates/:id
 * Updates an existing template.
 */
router.put(
  "/:id",
  requireAuth("practice:write"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const doctorUserId = req.sessionUser!.id;
      const templateId = String(req.params.id);
      let practiceId =
        typeof req.body?.practiceId === "string" ? req.body.practiceId : undefined;

      if (!practiceId) {
        practiceId = (await TemplateService.getPracticeIdForUser(doctorUserId)) ?? undefined;
      }
      if (!practiceId) {
        return ResponseHandler.unsuccessful(
          res,
          400,
          "No practice associated with current session.",
        );
      }

      const updated = await TemplateService.updateTemplate(
        practiceId,
        doctorUserId,
        templateId,
        req.body,
      );

      return ResponseHandler.fetchSuccessful(res, "template updated successfully.", updated);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * DELETE /api/v1/procto/templates/:id
 * Deletes a template.
 */
router.delete(
  "/:id",
  requireAuth("practice:write"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const doctorUserId = req.sessionUser!.id;
      const templateId = String(req.params.id);
      let practiceId =
        typeof req.query.practiceId === "string" ? req.query.practiceId : undefined;

      if (!practiceId) {
        practiceId = (await TemplateService.getPracticeIdForUser(doctorUserId)) ?? undefined;
      }
      if (!practiceId) {
        return ResponseHandler.unsuccessful(
          res,
          400,
          "No practice associated with current session.",
        );
      }

      await TemplateService.deleteTemplate(practiceId, doctorUserId, templateId);

      return ResponseHandler.fetchSuccessful(res, "template deleted successfully.", {
        deleted: true,
      });
    } catch (error) {
      next(error);
    }
  },
);

export default router;

