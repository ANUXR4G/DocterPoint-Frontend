import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { AuthService } from "../services/auth.js";
import { requireAuth } from "../middleware/auth.js";
import {
  clearTokenCookies,
  getUserToken,
  setTokenCookies,
  uuidToBase64,
} from "../core/security.js";
const router = Router();

router.post("/signup", async (req: Request, res: Response, next: NextFunction) => {
  try {
    await AuthService.signup(req.body, res);
  } catch (error) {
    next(error);
  }
});

router.post(
  "/register/doctor",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await AuthService.registerDoctor(req.body, res);
    } catch (error) {
      next(error);
    }
  },
);

router.post("/login", async (req: Request, res: Response, next: NextFunction) => {
  try {
    await AuthService.login(req.body, res);
  } catch (error) {
    next(error);
  }
});

/** Patient phone OTP — sent only from GlucoGuide platform WA (+91 99900 52082). */
router.post(
  "/otp/request",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { PhoneOtpAuthService } = await import(
        "../services/phoneOtpAuth.js"
      );
      await PhoneOtpAuthService.requestOtp(
        { phone: String(req.body?.phone ?? "") },
        res,
      );
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/otp/verify",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { PhoneOtpAuthService } = await import(
        "../services/phoneOtpAuth.js"
      );
      await PhoneOtpAuthService.verifyOtp(
        {
          phone: String(req.body?.phone ?? ""),
          code: String(req.body?.code ?? req.body?.otp ?? ""),
          name: req.body?.name ? String(req.body.name) : undefined,
        },
        res,
      );
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  "/me",
  requireAuth(),
  async (req: Request, res: Response) => {
    const user = req.sessionUser!;
    const { ResponseHandler } = await import("../core/response.js");
    return ResponseHandler.fetchSuccessful(res, "Account", {
      id: uuidToBase64(user.id),
      email: user.email,
      name: user.name,
      role: user.role,
      img_src: user.imgSrc ?? null,
      gender: user.gender ?? null,
    });
  },
);

router.get(
  "/token/refresh",
  requireAuth(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tokenResult = getUserToken(req.sessionUser!);
      setTokenCookies(res, tokenResult.cookies);
      return res.status(200).json(tokenResult.responseBody);
    } catch (error) {
      next(error);
    }
  },
);

router.get("/google", (req: Request, res: Response) => {
  const state = String(req.query.state ?? "");
  return res.send(AuthService.buildGoogleAuthUrl(state));
});

router.get("/google/callback", async (req: Request, res: Response, next: NextFunction) => {
  try {
    await AuthService.handleGoogleCallback(
      String(req.query.state ?? "{}"),
      req.query.code as string | undefined,
      req.query.error as string | undefined,
      res,
    );
  } catch (error) {
    next(error);
  }
});

router.post("/logout", (_req: Request, res: Response) => {
  clearTokenCookies(res);
  return res.status(200).json({ status: "successful", message: "logged out" });
});

/** Guest ID OCR for patient registration autofill (no auth; rate-limited globally). */
router.post(
  "/id-scan",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { IdScanService } = await import("../services/idScan.js");
      const { ResponseHandler } = await import("../core/response.js");
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

/**
 * Guest OCR for doctor / clinic registration — visiting card, letterhead,
 * medical licence, or clinic registration certificate.
 */
router.post(
  "/doc-scan",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { IdScanService } = await import("../services/idScan.js");
      const { ResponseHandler } = await import("../core/response.js");
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
          "imageBase64 is required (JPG/PNG/WEBP of the document).",
        );
      }

      const data = await IdScanService.extractProfessionalFromBase64({
        imageBase64,
        mimeType,
      });
      return ResponseHandler.fetchSuccessful(
        res,
        "professional details extracted.",
        data,
      );
    } catch (error) {
      next(error);
    }
  },
);

export default router;
