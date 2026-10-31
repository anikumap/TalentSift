import { AppError, HTTP_STATUS } from "@/lib/errors";
import { getActor } from "@/lib/session";
import { interviewIcs } from "@/services/interviews";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) return new Response("Log in first.", { status: 401 });
  try {
    const ics = await interviewIcs(actor, (await params).id);
    return new Response(ics, {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'attachment; filename="interview.ics"',
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    if (e instanceof AppError) return new Response(e.message, { status: HTTP_STATUS[e.code] });
    throw e;
  }
}
