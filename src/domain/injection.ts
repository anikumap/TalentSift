const RULES: { label: string; pattern: RegExp }[] = [
  { label: "ignore-instructions", pattern: /\b(ignore|disregard|forget)\b.{0,30}\b(previous|prior|above|earlier|all)\b.{0,20}\b(instructions?|prompts?|rules)\b/i },
  { label: "rank-me", pattern: /\b(rank|score|rate|put|place|mark)\s+(me|this candidate)\b.{0,30}\b(first|top|highest|best|4\/4|100)\b/i },
  { label: "addresses-ai", pattern: /\b(as an ai|language model|you are an? (ai|assistant|chatbot)|system prompt)\b/i },
  { label: "hidden-text", pattern: /[​-‏⁠﻿]/ },
];

/** Flags text that tries to manipulate an AI grader. Flags never change scores by themselves. */
export function detectInjection(text: string): string[] {
  return RULES.filter((r) => r.pattern.test(text)).map((r) => r.label);
}
