import { FINAL_STAGES, PIPELINE, type Stage } from "./constants";

export function nextStage(stage: Stage): Stage | null {
  const i = (PIPELINE as readonly Stage[]).indexOf(stage);
  if (i === -1 || i === PIPELINE.length - 1) return null;
  return PIPELINE[i + 1];
}

export function isFinal(stage: Stage): boolean {
  return FINAL_STAGES.includes(stage);
}

/** Any open stage can move anywhere else; final stages are locked. */
export function canTransition(from: Stage, to: Stage): boolean {
  if (from === to) return false;
  return !isFinal(from);
}
