"use client";

import { useEffect, useState, useTransition } from "react";
import { saveScorecardAction } from "@/app/actions/jobs";
import { normalizeWeights } from "@/domain/scoring";
import { MUST_HAVE_KINDS, type MustHaveKind } from "@/domain/constants";
import { FormError, Notice } from "@/components/ui";
import type { ActionState } from "@/lib/action";

type Skill = { id?: string; name: string; description: string; weight: number; keywords: string[] };
type MustHave = { id?: string; label: string; kind: MustHaveKind; question: string };

const KIND_LABELS: Record<MustHaveKind, string> = { LICENSE: "Licence", AVAILABILITY: "Availability", PAY: "Pay", OTHER: "Other" };

export function ScorecardEditor({
  jobId,
  skills: initialSkills,
  mustHaves: initialMustHaves,
  editable,
}: {
  jobId: string;
  skills: Skill[];
  mustHaves: MustHave[];
  editable: boolean;
}) {
  const [skills, setSkills] = useState(initialSkills.map((s) => ({ ...s, keywordText: s.keywords.join(", ") })));
  const [mustHaves, setMustHaves] = useState(initialMustHaves);
  const [state, setState] = useState<ActionState>(null);
  const [saving, startSave] = useTransition();
  // Server data changes after a save (new ids, normalized weights): take it as the new baseline.
  useEffect(() => {
    setSkills(initialSkills.map((s) => ({ ...s, keywordText: s.keywords.join(", ") })));
    setMustHaves(initialMustHaves);
  }, [initialSkills, initialMustHaves]);

  const normalized = normalizeWeights(skills.map((s) => Number(s.weight) || 0));

  const updateSkill = (i: number, patch: Partial<(typeof skills)[number]>) =>
    setSkills(skills.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const updateMustHave = (i: number, patch: Partial<MustHave>) =>
    setMustHaves(mustHaves.map((m, j) => (j === i ? { ...m, ...patch } : m)));

  function save() {
    startSave(async () => {
      const result = await saveScorecardAction(jobId, {
        skills: skills.map(({ keywordText, ...s }) => ({
          ...s,
          weight: Number(s.weight) || 0,
          keywords: keywordText.split(",").map((k) => k.trim()).filter(Boolean),
        })),
        mustHaves,
      });
      setState(result);
    });
  }

  return (
    <div className="space-y-8">
      <section aria-labelledby="skills-h">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="skills-h" className="text-lg font-semibold">Skills</h2>
          <p className="text-sm text-ink-3">3 to 6 skills. Weights are scaled to add up to 100%.</p>
        </div>
        <ul className="mt-3 space-y-3">
          {skills.map((s, i) => (
            <li key={s.id ?? `new-${i}`} className="panel p-4">
              <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
                <div>
                  <label className="label" htmlFor={`skill-name-${i}`}>Skill</label>
                  <input id={`skill-name-${i}`} className="field" value={s.name} disabled={!editable} onChange={(e) => updateSkill(i, { name: e.target.value })} />
                </div>
                <div>
                  <label className="label" htmlFor={`skill-weight-${i}`}>Weight</label>
                  <div className="flex items-center gap-2">
                    <input id={`skill-weight-${i}`} type="number" min={0} max={100} className="field tnum" value={s.weight} disabled={!editable} onChange={(e) => updateSkill(i, { weight: Number(e.target.value) })} />
                  </div>
                  <p className="tnum mt-1 text-xs text-ink-3" aria-live="polite">Counts as {normalized[i]}%</p>
                </div>
              </div>
              <label className="label mt-3" htmlFor={`skill-desc-${i}`}>What good looks like</label>
              <input id={`skill-desc-${i}`} className="field" value={s.description} disabled={!editable} onChange={(e) => updateSkill(i, { description: e.target.value })} />
              <label className="label mt-3" htmlFor={`skill-kw-${i}`}>Evidence words</label>
              <input id={`skill-kw-${i}`} className="field" value={s.keywordText} disabled={!editable} onChange={(e) => updateSkill(i, { keywordText: e.target.value })} />
              <p className="hint mt-1">Words or phrases that show this skill in an answer, separated by commas.</p>
              {editable && skills.length > 3 && (
                <button type="button" className="btn-ghost mt-2 px-0 text-reject" onClick={() => setSkills(skills.filter((_, j) => j !== i))}>
                  Remove skill
                </button>
              )}
            </li>
          ))}
        </ul>
        {editable && skills.length < 6 && (
          <button
            type="button"
            className="btn-secondary mt-3"
            onClick={() => setSkills([...skills, { name: "", description: "", weight: 10, keywords: [], keywordText: "" }])}
          >
            Add skill
          </button>
        )}
      </section>

      <section aria-labelledby="mh-h">
        <h2 id="mh-h" className="text-lg font-semibold">Must-haves</h2>
        <p className="text-sm text-ink-3">Applicants answer yes or no. Anyone who says no is marked on the shortlist, never rejected automatically.</p>
        <ul className="mt-3 space-y-3">
          {mustHaves.map((m, i) => (
            <li key={m.id ?? `new-${i}`} className="panel grid gap-3 p-4 sm:grid-cols-[1fr_160px]">
              <div>
                <label className="label" htmlFor={`mh-label-${i}`}>Requirement</label>
                <input id={`mh-label-${i}`} className="field" value={m.label} disabled={!editable} onChange={(e) => updateMustHave(i, { label: e.target.value })} />
              </div>
              <div>
                <label className="label" htmlFor={`mh-kind-${i}`}>Type</label>
                <select id={`mh-kind-${i}`} className="field" value={m.kind} disabled={!editable} onChange={(e) => updateMustHave(i, { kind: e.target.value as MustHaveKind })}>
                  {MUST_HAVE_KINDS.map((k) => (
                    <option key={k} value={k}>{KIND_LABELS[k]}</option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="label" htmlFor={`mh-q-${i}`}>Question applicants see</label>
                <input id={`mh-q-${i}`} className="field" value={m.question} disabled={!editable} onChange={(e) => updateMustHave(i, { question: e.target.value })} />
                {editable && (
                  <button type="button" className="btn-ghost mt-2 px-0 text-reject" onClick={() => setMustHaves(mustHaves.filter((_, j) => j !== i))}>
                    Remove must-have
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
        {editable && mustHaves.length < 8 && (
          <button type="button" className="btn-secondary mt-3" onClick={() => setMustHaves([...mustHaves, { label: "", kind: "OTHER", question: "" }])}>
            Add must-have
          </button>
        )}
      </section>

      {editable && (
        <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center gap-3 border-t border-line bg-paper/95 px-4 py-3 backdrop-blur">
          <button type="button" className="btn-primary" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save scorecard"}
          </button>
          {state?.ok && <Notice tone="ok">{state.message}</Notice>}
          <FormError message={state?.error} />
        </div>
      )}
    </div>
  );
}
