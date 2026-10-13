import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { PatientService } from "../services/patient.js";
import { listHousehold, switchHousehold } from "../services/patientHousehold.js";
import { IdScanService } from "../services/idScan.js";
import { requireAuth } from "../middleware/auth.js";
import { getRedis } from "../db/redis.js";
import { ResponseHandler } from "../core/response.js";

const router = Router();

router.get(
  "/household",
  requireAuth("patient:read"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await listHousehold(req.sessionUser!.id);
      return ResponseHandler.fetchSuccessful(res, "profiles on this number.", data);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/household/switch",
  requireAuth("patient:read"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const patientUserId = String(req.body?.patientUserId ?? req.body?.id ?? "");
      return await switchHousehold(req.sessionUser!.id, patientUserId, res);
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  "/profile",
  requireAuth("patient:read"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await PatientService.getProfileInfo(req.sessionUser!, getRedis());
      return res.json(result);
    } catch (error) {
      next(error);
    }
  },
);

/** OCR / vision extract from government ID image → autofill fields. */
router.post(
  "/profile/id-scan",
  requireAuth("patient:read", "patient:update"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const imageBase64 =
        (req.body?.imageBase64 as string | undefined) ||
        (req.body?.image_base64 as string | undefined);
      const mimeType =
        (req.body?.mimeType as string | undefined) ||
        (req.body?.mime_type as string | undefined);

      if (!imageBase64 || typeof imageBase64 !== "string") {
        return ResponseHandler.unsuccessful(
          res,
          400,
          "imageBase64 is required (JPG/PNG/WEBP of the ID).",
        );
      }

      const data = await IdScanService.extractFromBase64({
        imageBase64,
        mimeType,
      });
      return ResponseHandler.fetchSuccessful(
        res,
        "document details extracted.",
        data,
      );
    } catch (error) {
      next(error);
    }
  },
);

router.put(
  "/profile",
  requireAuth("patient:read", "patient:update"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await PatientService.changePatientInformation(
        req.body,
        req.sessionUser!,
        getRedis(),
      );
      return res.json(result);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/profile/aadhar-card",
  requireAuth("patient:read", "patient:update"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const imageBase64 =
        (req.body?.imageBase64 as string | undefined) ||
        (req.body?.image_base64 as string | undefined);
      const mimeType =
        (req.body?.mimeType as string | undefined) ||
        (req.body?.mime_type as string | undefined);

      if (!imageBase64 || typeof imageBase64 !== "string") {
        return ResponseHandler.unsuccessful(
          res,
          400,
          "imageBase64 is required (JPG/PNG/WEBP of the Aadhaar card).",
        );
      }

      const data = await PatientService.uploadAadharCard(
        req.sessionUser!,
        { imageBase64, mimeType },
        getRedis(),
      );
      return ResponseHandler.fetchSuccessful(
        res,
        "Aadhaar card uploaded.",
        data,
      );
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/profile/photo",
  requireAuth("patient:read", "patient:update"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const imageBase64 =
        (req.body?.imageBase64 as string | undefined) ||
        (req.body?.image_base64 as string | undefined);
      const mimeType =
        (req.body?.mimeType as string | undefined) ||
        (req.body?.mime_type as string | undefined);

      if (!imageBase64 || typeof imageBase64 !== "string") {
        return ResponseHandler.unsuccessful(
          res,
          400,
          "imageBase64 is required (JPG/PNG/WEBP profile photo).",
        );
      }

      const data = await PatientService.uploadProfilePhoto(
        req.sessionUser!,
        { imageBase64, mimeType },
        getRedis(),
      );
      return ResponseHandler.fetchSuccessful(
        res,
        "Profile photo uploaded.",
        data,
      );
    } catch (error) {
      next(error);
    }
  },
);

router.put(
  "/profile/password",
  requireAuth("patient:read", "patient:update"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await PatientService.changeUserPassword(req.body, req.sessionUser!);
      return res.json(result);
    } catch (error) {
      next(error);
    }
  },
);

router.patch(
  "/theme",
  requireAuth("patient:read", "patient:update"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const textSize =
        req.body?.textSize !== undefined
          ? req.body.textSize
          : req.body?.text_size !== undefined
            ? req.body.text_size
            : undefined;
      const bgSrc =
        req.body?.bgSrc !== undefined
          ? req.body.bgSrc
          : req.body?.bg_src !== undefined
            ? req.body.bg_src
            : undefined;
      if (textSize === undefined && bgSrc === undefined) {
        return res.status(400).json({
          status: "unsuccessful",
          message: "Provide bgSrc and/or textSize (small | medium | large).",
        });
      }
      const result = await PatientService.updateThemePreferences(
        req.sessionUser!,
        { textSize, bgSrc },
        getRedis(),
      );
      return res.json({
        status: "successful",
        message: "appearance preferences updated.",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
