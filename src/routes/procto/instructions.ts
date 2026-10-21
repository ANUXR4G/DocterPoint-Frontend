import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { ResponseHandler } from "../../core/response.js";
import { InstructionService } from "../../services/procto/instruction.service.js";

const router = Router();

/**
 * GET /api/v1/procto/instructions
 * Lists all preset and practice-custom special instructions.
 */
router.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const practiceId =
      typeof req.query.practiceId === "string" ? req.query.practiceId : undefined;
    const userId = req.sessionUser?.id;

    const result = await InstructionService.listInstructions({
      practiceId,
      userId,
    });

    return ResponseHandler.fetchSuccessful(
      res,
      "instructions fetched successfully.",
      result,
      result.instructions.length,
    );
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/procto/instructions
 * Records a brand new custom instruction for future selections.
 */
router.post("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rawText = String(req.body?.instruction || req.body?.name || "").trim();
    if (!rawText) {
      return ResponseHandler.unsuccessful(res, 400, "Instruction text is required.");
    }

    let practiceId =
      typeof req.body?.practiceId === "string" ? req.body.practiceId : undefined;
    if (!practiceId && req.sessionUser?.id) {
      practiceId = (await InstructionService.getPracticeIdForUser(req.sessionUser.id)) ?? undefined;
    }

    if (!practiceId) {
      // Fallback: return accepted instruction even if no practice assigned
      return ResponseHandler.createSuccessful(
        res,
        "instruction registered.",
        { instruction: rawText, saved: false },
      );
    }

    const saved = await InstructionService.recordCustomInstruction(practiceId, rawText);

    return ResponseHandler.createSuccessful(
      res,
      "instruction saved successfully.",
      { instruction: saved || rawText, saved: Boolean(saved) },
    );
  } catch (error) {
    next(error);
  }
});

export default router;
