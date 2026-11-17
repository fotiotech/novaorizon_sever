import type { Request, Response, NextFunction } from "express";
import { isDev } from "../config/env.js";

export class AppError extends Error {
  status: number;
  constructor(message: string, status = 500) {
    super(message);
    this.name = "AppError";
    this.status = status;
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "You must be signed in.") {
    super(message, 401);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You do not have permission to do that.") {
    super(message, 403);
    this.name = "ForbiddenError";
  }
}

/**
 * Field-level validation error. Callers pass `{ field: string[] | undefined }`
 * so conditional checks can be written inline:
 *
 *   throw new ValidationError({
 *     name: name ? undefined : ["name required"],
 *     email: email ? undefined : ["email required"],
 *   });
 *
 * The `undefined` entries are filtered out at construction — the `fieldErrors`
 * property is always `Record<string, string[]>` with only real errors.
 */
export class ValidationError extends AppError {
  fieldErrors: Record<string, string[]>;

  constructor(
    fieldErrors: Record<string, string[] | undefined>,
    message = "Validation failed",
  ) {
    super(message, 400);
    this.name = "ValidationError";
    this.fieldErrors = Object.fromEntries(
      Object.entries(fieldErrors).filter(
        (entry): entry is [string, string[]] => entry[1] !== undefined,
      ),
    );
  }
}

export function notFoundHandler(req: Request, res: Response): void {
  res
    .status(404)
    .json({ error: `Not found: ${req.method} ${req.originalUrl}` });
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const status = err instanceof AppError ? err.status : 500;
  const message = err instanceof Error ? err.message : "Internal server error";

  if (isDev) console.error(err);

  const body: Record<string, unknown> = { error: message };
  if (err instanceof ValidationError) body.fieldErrors = err.fieldErrors;
  if (isDev && err instanceof Error) body.stack = err.stack;

  res.status(status).json(body);
}
