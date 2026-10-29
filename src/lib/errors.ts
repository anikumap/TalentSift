export type AppErrorCode = "FORBIDDEN" | "NOT_FOUND" | "VALIDATION" | "LIMIT" | "CONFLICT";

export class AppError extends Error {
  constructor(
    public readonly code: AppErrorCode,
    message: string,
    public readonly fields?: Record<string, string>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const HTTP_STATUS: Record<AppErrorCode, number> = {
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION: 400,
  LIMIT: 402,
  CONFLICT: 409,
};
