import { AppError } from "./errors";

export type ActionState = { error?: string; fields?: Record<string, string>; ok?: boolean; message?: string } | null;

/** Runs a server-action body, turning AppErrors into form state. Re-throws redirects and real bugs. */
export async function runAction(fn: () => Promise<ActionState | void>): Promise<ActionState> {
  try {
    return (await fn()) ?? { ok: true };
  } catch (e) {
    if (e instanceof AppError) return { error: e.message, fields: e.fields };
    throw e;
  }
}

export function str(form: FormData, key: string): string {
  const v = form.get(key);
  return typeof v === "string" ? v : "";
}
