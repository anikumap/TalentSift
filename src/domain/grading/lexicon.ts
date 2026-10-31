/**
 * Shared vocabulary for the rule-based grader. Rubric patterns reference groups as "@name".
 * Words are matched by stem, so list base forms; multi-word entries match as consecutive words.
 */
export const SYNONYMS: Record<string, string[]> = {
  inform: ["inform", "tell", "call", "report", "update", "notify", "message", "phone", "let know", "alert", "whatsapp", "ring", "contact", "escalate", "speak to", "talk to"],
  supervisor: ["supervisor", "manager", "team lead", "lead", "senior", "head", "owner", "office", "dispatcher", "control room", "store manager", "shift lead", "nurse", "agency", "coordinator", "company"],
  family: ["family", "daughter", "son", "relative", "wife", "husband", "guardian", "family member", "children"],
  medical: ["doctor", "nurse", "ambulance", "hospital", "clinic", "108", "112", "102", "emergency number", "medical help", "medical team"],
  check: ["check", "verify", "confirm", "double check", "recheck", "recount", "scan", "cross check", "inspect", "look", "examine", "compare", "match", "count"],
  calm: ["calm", "patient", "patiently", "gently", "gentle", "softly", "polite", "politely", "kindly", "kind", "relax", "reassure", "comfort", "smile", "respectful", "respectfully", "friendly", "courteous", "soothe"],
  apologise: ["sorry", "apologize", "apology", "regret"],
  listen: ["listen", "ask", "understand", "hear", "find out", "question", "enquire", "inquire"],
  explain: ["explain", "tell", "show", "describe", "clarify", "guide"],
  wait: ["wait", "stay", "remain", "hold", "stand by"],
  followup: ["follow up", "check back", "check again", "call back", "later", "again", "next day", "make sure", "ensure", "confirm"],
  record: ["note", "write", "record", "log", "chart", "register", "diary", "entry", "document", "book"],
  safe: ["safe", "safety", "carefully", "careful", "caution", "secure"],
  help: ["help", "assist", "support", "cover", "share", "join", "together", "hand"],
  stop: ["stop", "pause", "halt", "pull over", "park", "switch off"],
  block: ["block", "cordon", "keep away", "keep people away", "warn", "sign", "tape", "barrier", "mark"],
  photo: ["photo", "picture", "pic", "video", "image", "proof", "evidence"],
  plan: ["plan", "organize", "prioritize", "priority", "sort", "arrange", "order", "sequence", "schedule", "route", "line up", "first", "ticket", "tickets"],
  time: ["on time", "early", "punctual", "time", "minute", "hour", "before", "deadline"],
  honest: ["honest", "honestly", "truth", "true", "admit", "transparent", "own up"],
  clean: ["clean", "wash", "scrub", "wipe", "sanitize", "sanitiser", "sanitizer", "disinfect", "rinse", "mop", "soap", "hygiene", "hygienic"],
  discard: ["throw", "throw away", "bin", "discard", "dispose", "remove", "get rid"],
  store: ["store", "container", "sealed", "covered", "lid", "fridge", "bottom shelf", "lowest shelf", "label", "separate"],
  prep: ["prep", "prepare", "chop", "chopping", "cut", "cutting", "ready", "batch", "in advance", "ahead"],
  fast: ["fast", "quick", "quickly", "speed", "hurry", "rush", "pace", "faster"],
  team: ["team", "colleague", "colleagues", "crew", "staff", "helper", "helpers", "together", "coworker"],
  chef: ["chef", "cook", "head cook", "kitchen manager"],
  communicate: ["communicate", "tell", "inform", "update", "shout out", "call out", "let know"],
};

/** Stems that show a sentence describes an action rather than listing words. */
export const ACTION_VERBS: ReadonlySet<string> = new Set([
  "tell", "call", "check", "give", "take", "ask", "stay", "wait", "help", "move", "lift", "report", "inform",
  "explain", "offer", "show", "count", "scan", "keep", "write", "note", "clean", "stop", "plan", "drive", "park",
  "deliver", "refund", "replace", "listen", "apologize", "say", "speak", "talk", "make", "put", "bring", "send",
  "follow", "try", "find", "look", "go", "come", "use", "wear", "hold", "let", "get", "do", "be", "is", "am", "are",
  "will", "would", "should", "must", "can", "could", "i'd", "i'll", "i'm", "need", "remove", "clear", "fix", "pick",
  "pack", "stack", "label", "sort", "arrange", "verify", "confirm", "record", "update", "notify", "lay", "cover", "support", "assist", "share", "join", "finish", "complete", "start", "begin",
  "leave", "return", "exchange", "repair", "compare", "suggest", "recommend", "demonstrate", "match", "inspect",
  "warn", "block", "mark", "photograph", "click", "message", "phone", "ring", "contact", "handle", "manage",
  "learn", "remind", "prepare", "serve", "greet", "thank", "accept", "refuse", "avoid", "slow", "reduce",
  "switch", "watch", "monitor", "see", "hear", "understand", "feel", "think", "know", "decide", "inform", "escalate",
  "document", "log", "wash", "store", "dispose", "measure", "cut", "cook", "prioritize", "organize", "focus",
  "ensure", "allow", "encourage", "convince", "persuade", "respect", "protect", "secure", "lock", "unlock", "pay",
  "collect", "hand", "carry", "push", "pull", "load", "unload", "drop", "wipe", "mop", "refill", "restock", "price",
  "tidy", "fill", "change", "swap", "reroute", "navigate", "map", "contact", "arrive", "reach",
  "split", "divide", "grab", "pitch", "restack", "snap", "bin", "scrub", "walk", "figure", "hit", "flag", "fetch",
  "set", "dial", "jot", "stick", "line", "knock", "batch", "shout", "sit", "crush", "ride", "throw", "close", "open",
  "sanitize", "shift", "wrap", "tape", "alert", "drink", "eat", "offer", "sort", "re-plan", "replan",
  "hear", "own", "admit", "recount", "apologize", "suggest", "explain", "ensure", "double", "re-scan", "rescan",
]);

/** Auxiliaries and light verbs: present in almost every sentence, so they don't show an action. */
export const AUXILIARIES: ReadonlySet<string> = new Set(["be", "is", "am", "are", "was", "were", "will", "would", "should", "must", "can", "could", "i'd", "i'll", "i'm", "do", "get", "let", "need", "go", "come"]);

export const SEQUENCE_MARKERS = ["first", "firstly", "then", "next", "after that", "afterwards", "finally", "second", "secondly", "third", "lastly", "after", "once", "meanwhile", "before"];

export const FILLER_PHRASES = [
  "handle it properly", "handle it", "do the needful", "do my best", "do my work", "take care of it", "take care",
  "manage it", "manage the situation", "as required", "whatever is needed", "whatever is required", "do something",
  "solve it", "solve the problem", "handle the situation", "deal with it", "as per rules", "properly",
];

export function expand(word: string): string[] {
  if (!word.startsWith("@")) return [word];
  const group = SYNONYMS[word.slice(1)];
  if (!group) throw new Error(`Unknown lexicon group ${word}`);
  return group;
}

/** The synonym groups that contain this word (for generic rubrics). */
export function groupsContaining(word: string): string[] {
  const w = word.toLowerCase();
  return Object.entries(SYNONYMS)
    .filter(([, words]) => words.includes(w))
    .map(([name]) => name);
}
