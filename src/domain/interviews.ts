/** Interview time maths. India has one time zone and no daylight saving, so IST is a fixed +05:30. */
export const IST = "Asia/Kolkata";
export const MAX_SLOTS_PER_BATCH = 32;
export const CHANGE_WINDOW_HOURS = 12;
export const SLOT_MIN_LENGTH = 15;
export const SLOT_MAX_LENGTH = 240;

const IST_OFFSET_MS = 330 * 60_000;
const MINUTE = 60_000;

/** "YYYY-MM-DD" + "HH:MM" read as India time, returned as a UTC instant. Throws on malformed input. */
export function istToUtc(date: string, time: string): Date {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const t = /^(\d{2}):(\d{2})$/.exec(time);
  if (!d || !t) throw new Error(`Bad date or time: ${date} ${time}`);
  const [y, mo, da, h, mi] = [+d[1], +d[2], +d[3], +t[1], +t[2]];
  if (mo < 1 || mo > 12 || da < 1 || da > 31 || h > 23 || mi > 59) throw new Error(`Bad date or time: ${date} ${time}`);
  const utc = Date.UTC(y, mo - 1, da, h, mi) - IST_OFFSET_MS;
  const check = new Date(utc + IST_OFFSET_MS);
  if (check.getUTCDate() !== da) throw new Error(`No such date: ${date}`);
  return new Date(utc);
}

/** Back-to-back slot starts between `from` and `to` (IST) on `date`. A partial last slot is dropped. */
export function slotTimes(date: string, from: string, to: string, lengthMin: number): Date[] {
  const start = istToUtc(date, from).getTime();
  const end = istToUtc(date, to).getTime();
  const out: Date[] = [];
  for (let t = start; t + lengthMin * MINUTE <= end; t += lengthMin * MINUTE) out.push(new Date(t));
  return out;
}

type Span = { startsAt: Date; durationMin: number };

export function overlaps(a: Span, b: Span): boolean {
  const aEnd = a.startsAt.getTime() + a.durationMin * MINUTE;
  const bEnd = b.startsAt.getTime() + b.durationMin * MINUTE;
  return a.startsAt.getTime() < bEnd && b.startsAt.getTime() < aEnd;
}

/** Candidates can change or cancel up to 12 hours before the start. */
export function canCandidateChange(startsAt: Date, now: Date): boolean {
  return startsAt.getTime() - now.getTime() >= CHANGE_WINDOW_HOURS * 3_600_000;
}

const dateTimeFmt = new Intl.DateTimeFormat("en-IN", {
  timeZone: IST,
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
});
const timeFmt = new Intl.DateTimeFormat("en-IN", { timeZone: IST, hour: "numeric", minute: "2-digit" });
const dayFmt = new Intl.DateTimeFormat("en-IN", { timeZone: IST, weekday: "long", day: "numeric", month: "long" });

/** e.g. "Wed, 4 Nov, 10:00 am" in India time. */
export const istDateTime = (d: Date): string => dateTimeFmt.format(d);
/** e.g. "10:00 am" in India time. */
export const istTime = (d: Date): string => timeFmt.format(d);
/** e.g. "Wednesday, 4 November" in India time. */
export const istDay = (d: Date): string => dayFmt.format(d);

/** "YYYY-MM-DD" of the India calendar day `d` falls on. */
export function istDayKey(d: Date): string {
  return new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

const icsStamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const icsText = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** A single-event iCalendar file (RFC 5545) that any phone or mail app can add. */
export function toIcs(e: { uid: string; startsAt: Date; durationMin: number; summary: string; location: string; description: string }): string {
  const end = new Date(e.startsAt.getTime() + e.durationMin * MINUTE);
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//TalentSift//EN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${e.uid}@talentsift`,
    `DTSTAMP:${icsStamp(e.startsAt)}`,
    `DTSTART:${icsStamp(e.startsAt)}`,
    `DTEND:${icsStamp(end)}`,
    `SUMMARY:${icsText(e.summary)}`,
    `LOCATION:${icsText(e.location)}`,
    `DESCRIPTION:${icsText(e.description)}`,
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}
