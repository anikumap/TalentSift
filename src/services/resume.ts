import { extractText, getDocumentProxy } from "unpdf";

async function pdfText(bytes: Buffer): Promise<string> {
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  return (await extractText(pdf, { mergePages: true })).text;
}

export const RESUME_MAX_BYTES = 5 * 1024 * 1024;
export const RESUME_TYPES = [".pdf", ".txt"];

export function resumeExtension(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot === -1 ? "" : filename.slice(dot).toLowerCase();
}

/** Plain text of a resume, or null if it can't be read. Never throws. */
export async function extractResumeText(file: { filename: string; bytes: Buffer }): Promise<string | null> {
  try {
    const ext = resumeExtension(file.filename);
    const text =
      ext === ".pdf"
        ? await pdfText(file.bytes)
        : ext === ".txt"
          ? file.bytes.toString("utf8")
          : "";
    const clean = text.replace(/\s+/g, " ").trim().slice(0, 20_000);
    return clean.length ? clean : null;
  } catch {
    return null;
  }
}
