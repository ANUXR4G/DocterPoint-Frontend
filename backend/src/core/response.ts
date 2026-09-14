import type { Response } from "express";

export class AppError extends Error {
  statusCode: number;
  headers?: Record<string, string>;

  constructor(statusCode: number, message: string, headers?: Record<string, string>) {
    super(message);
    this.statusCode = statusCode;
    this.headers = headers;
  }
}

export const ResponseHandler = {
  invalidToken(msg = "invalid token."): never {
    throw new AppError(401, msg, { "WWW-Authenticate": "Bearer" });
  },

  notFoundError(warning = "not found."): never {
    throw new AppError(404, warning);
  },

  unauthorized(message: string): never {
    throw new AppError(401, message);
  },

  noPermission(message: string): never {
    throw new AppError(403, message);
  },

  fetchSuccessful<T>(
    res: Response,
    msg: string,
    data: T,
    total?: number,
  ): Response {
    const responseContent: Record<string, unknown> = {
      status: "successful",
      message: msg,
      data,
    };
    if (total !== undefined) {
      responseContent.total = total;
    }
    return res.status(200).json(responseContent);
  },

  createSuccessful<T>(res: Response, msg: string, data: T): Response {
    return res.status(201).json({
      status: "successful",
      message: msg,
      data,
    });
  },

  unsuccessful(res: Response, statusCode: number, message: string): Response {
    return res.status(statusCode).json({
      status: "unsuccessful",
      message,
    });
  },
};
