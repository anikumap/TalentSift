import { interviewIcsByToken } from "@/services/interviews";

export async function GET(_: Request, { params }: { params: Promise<{ token: string }> }) {
  const ics = await interviewIcsByToken((await params).token);
  if (!ics) return new Response("No interview booked for this link.", { status: 404 });
  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="interview.ics"',
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}
