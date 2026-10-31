import { NextResponse } from "next/server";
import { AppError, HTTP_STATUS } from "@/lib/errors";
import { allow, clientIp } from "@/lib/rateLimit";
import { submitApplication } from "@/services/applications";

function parseJson<T>(value: FormDataEntryValue | null, fallback: T): T {
  if (typeof value !== "string") return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  // Resume limit is 5 MB; refuse anything far larger before buffering it in memory.
  if (Number(req.headers.get("content-length") ?? 0) > 6 * 1024 * 1024) {
    return NextResponse.json({ error: "That upload is too large. Resumes must be 5 MB or smaller." }, { status: 413 });
  }
  // Generous enough for a shared phone or cyber café, tight enough to stop scripted floods.
  if (!allow(`apply:${clientIp(req.headers)}`, 30, 60 * 60_000)) {
    return NextResponse.json({ error: "Too many applications from this connection. Please try again in an hour." }, { status: 429 });
  }
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Couldn't read the form. Please try again." }, { status: 400 });
  }

  const file = form.get("resume");
  const resume =
    file instanceof File && file.size > 0 ? { filename: file.name, bytes: Buffer.from(await file.arrayBuffer()) } : undefined;

  try {
    const { publicRef } = await submitApplication(slug, {
      consent: form.get("consent") === "true",
      name: String(form.get("name") ?? ""),
      email: String(form.get("email") ?? ""),
      phone: String(form.get("phone") ?? ""),
      city: String(form.get("city") ?? ""),
      mustHaveAnswers: parseJson<Record<string, boolean>>(form.get("mustHaveAnswers"), {}),
      answers: parseJson<Record<string, string>>(form.get("answers"), {}),
      selfId: parseJson<Record<string, string>>(form.get("selfId"), {}),
      resume,
    } as Parameters<typeof submitApplication>[1]);
    return NextResponse.json({ publicRef });
  } catch (e) {
    if (e instanceof AppError) {
      return NextResponse.json({ error: e.message, fields: e.fields }, { status: HTTP_STATUS[e.code] });
    }
    console.error("Apply failed", e);
    return NextResponse.json({ error: "Something went wrong on our side. Your answers are still here — please try again." }, { status: 500 });
  }
}
