const EMAIL = /[\w.+-]+@[\w-]+(\.[\w-]+)+/g;
// Runs of digits with common phone separators; replaced only if they hold 10+ digits.
const PHONE = /\+?\d[\d\s\-().]{8,}\d/g;

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Hide contact details and the candidate's name in free text shown to reviewers. */
export function redactText(text: string, names: string[]): string {
  let out = text
    .replace(EMAIL, "[email]")
    .replace(PHONE, (m) => (m.replace(/\D/g, "").length >= 10 ? "[phone]" : m));
  for (const raw of names.flatMap((n) => n.split(/\s+/))) {
    const token = raw.trim();
    if (token.replace(/\W/g, "").length < 2) continue;
    out = out.replace(new RegExp(`(?<!\\w)${escapeRegex(token)}(?!\\w)`, "gi"), "[name]");
  }
  return out;
}
