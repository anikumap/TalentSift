import { z } from "zod";
import { AppError } from "./errors";

/** Parse with zod, turning failures into a VALIDATION AppError with per-field messages. */
export function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const fields: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join(".") || "form";
    fields[key] ??= issue.message;
  }
  throw new AppError("VALIDATION", Object.values(fields)[0] ?? "Invalid input", fields);
}

export const email = z.string().trim().toLowerCase().email("Enter a valid email address");
export const password = z.string().min(8, "Password must be at least 8 characters").max(200);
export const name = z.string().trim().min(1, "Required").max(120);
