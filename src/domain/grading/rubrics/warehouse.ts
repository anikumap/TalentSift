import type { Rubric } from "../grade";
import { any, avoids, concept, flag, pair, rubric } from "./helpers";

const SKIP_CHECKS = flag("skip-checks", any("stop scanning", "skip scanning", "skip the checks", "skip checks", "just pack", "pack fast", "fix mistakes later", "pack it anyway", "target is more important", "target more important"));

export const WAREHOUSE_RUBRICS: Rubric[] = [
  rubric(
    "Safety awareness",
    [
      concept("stop-work", 1, any("@stop", "stop work", "stop what")),
      concept("keep-away", 2, any("@block", "keep away", "go near", "no one walks", "nobody walks", "walks under", "clear the area", "walkway clear", "cones", "cone", "block off", "people away")),
      concept("report", 2, pair(["@inform"], ["@supervisor"])),
      avoids("no-diy", 1, any("climb", "by hand", "myself", "alone", "pull")),
      concept("equipment", 2, any("forklift", "pallet jack", "equipment", "jack", "restack", "re-stack", "with help", "together", "helpers")),
      concept("ppe", 1, any("ppe", "gloves", "helmet", "safety shoes", "vest", "jacket")),
      concept("verify-log", 1, pair(["@check"], ["stable", "safe", "fixed", "secure", "wrapped"]), any("log", "register", "incident", "record")),
    ],
    [flag("diy-unsafe", any("climb", "fix it myself", "myself quickly", "no need to disturb", "ignore it", "leave it", "walk past"))],
  ),
  rubric("Teamwork", [
    concept("get-help", 2, pair(["ask", "call", "get", "grab", "take"], ["colleague", "team", "helper", "lads", "people", "operator", "someone", "everyone", "help"]), any("together", "helpers", "help me", "help us", "with help", "with team", "with the team", "with my team", "the lads", "the crew")),
    concept("help-others", 2, pair(["help", "support", "assist", "pitch in"], ["colleague", "team", "member", "whoever", "slow", "others", "them", "stuck", "behind"]), any("pitch in")),
    concept("coordinate", 2, any("split", "divide", "share", "two people", "one packing", "organize", "assign", "who does what", "among the crew", "between all", "between us")),
    concept("communicate", 1, pair(["@inform", "explain"], ["team", "everyone", "all", "people", "colleagues", "crew", "member"])),
    concept("thank", 1, any("thank", "update the team", "keep everyone updated")),
  ]),
  rubric(
    "Accuracy in picking & packing",
    [
      avoids("no-ship", 2, any("pack", "send", "ship", "dispatch", "let it go", "go out")),
      concept("aside", 1, any("aside", "one side", "problem area", "keep it separate", "hold it")),
      concept("recheck", 2, pair(["@check", "scan", "look", "compare"], ["barcode", "sku", "label", "code", "carton", "box", "order", "sheet", "again", "second"])),
      concept("compare-order", 1, any("order sheet", "against the order", "with the order", "sku", "quantity", "line up", "match")),
      concept("inform", 2, pair(["@inform", "flag"], ["@supervisor", "inventory", "team"])),
      concept("correct-item", 1, any("correct item", "right item", "right one", "correct one", "right location", "from the rack", "from rack"), pair(["pick", "fetch", "take", "get"], ["correct", "right"], 3)),
      concept("record", 1, any("update the system", "in the system", "system", "record", "log")),
    ],
    [flag("ship-anyway", any("pack it anyway", "send it anyway", "ship it anyway", "pack anyway", "send anyway", "will return it", "scanner is sometimes wrong", "scanner is wrong", "ignore it"))],
  ),
  rubric(
    "Speed & productivity",
    [
      concept("prioritise", 2, any("prioritize", "priority", "urgent", "most important", "matter most", "have to leave", "dispatch time", "deadline", "trucks"), pair(["do", "focus", "hit", "start"], ["urgent", "important", "those first"], 4)),
      concept("plan", 2, any("plan", "organize", "sort", "arrange", "split", "what's left", "remaining", "figure out")),
      avoids("keep-checks", 2, any("skip", "shortcut", "shortcuts", "cutting corners", "cut corners")),
      concept("status", 1, any("where we stand", "how far behind", "how many we can finish", "one more hour", "realistic"), pair(["@inform"], ["@supervisor"])),
      concept("pace", 1, any("fast", "faster", "quick", "quickly", "work harder", "more picking", "continue", "fall behind", "keep pace", "stay late", "stay back", "extra")),
    ],
    [SKIP_CHECKS],
  ),
  rubric(
    "Reliability",
    [
      concept("stay-late", 2, any("stay late", "stay back", "stay extra", "stay till", "stay until", "extra time", "overtime", "extra hour")),
      avoids("no-leave", 1, any("go home", "leave")),
      concept("honest", 1, any("honest", "honestly", "truthfully", "where we stand", "how far behind")),
      concept("report", 1, pair(["@inform"], ["@supervisor"])),
      concept("finish", 2, any("finish", "complete", "get it done")),
      concept("handover", 1, any("handover", "hand over")),
    ],
    [flag("leave-early", any("leave early", "leave on time", "go home", "not my problem"))],
  ),
];
