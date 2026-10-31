import type { Rubric } from "../grade";
import { any, avoids, concept, flag, pair, rubric } from "./helpers";

const CASH_COVER_UP = flag("cash-cover-up", any("own pocket", "my pocket", "my own money", "tips box", "from tips", "nobody finds out", "no one finds out", "hide it", "cover it up", "adjust the cash"));

export const RETAIL_RUBRICS: Rubric[] = [
  rubric(
    "Customer service",
    [
      concept("calm", 2, any("@calm", "stay polite", "don't worry", "please")),
      concept("listen", 2, any("listen", "hear them out", "hear him out", "hear her out", "let them explain", "let him explain", "let her explain", "without interrupting", "understand", "ask what", "find out")),
      concept("apologise", 1, any("@apologise")),
      concept("solution", 2, any("replace", "replacement", "exchange", "repair", "refund", "swap", "new piece", "new one", "fresh one", "solution", "suggest", "recommend", "demo")),
      concept("escalate", 1, pair(["@inform", "bring", "involve"], ["@supervisor"])),
      concept("follow-up", 1, any("follow up", "call them", "call back", "make sure they", "happy", "satisfied", "leave with")),
      avoids("no-argue", 1, any("argue", "blame", "fight", "shout", "rude", "force", "forcing", "pressure", "push")),
      concept("choice", 1, any("their choice", "customer choice", "let them decide", "no pressure")),
    ],
    [flag("blame-customer", any("your fault", "his fault", "her fault", "their fault", "you broke", "must have dropped", "no return", "not my problem", "shout at", "argue with", "get out", "even if i don't know"))],
  ),
  rubric(
    "Cash handling & billing",
    [
      concept("recount", 2, any("recount"), pair(["count", "go through"], ["again", "cash", "money", "drawer", "notes", "twice", "more time", "slowly", "2 times"])),
      concept("check-records", 2, pair(["@check", "look", "match", "compare", "ask for", "go through"], ["bill", "receipt", "register", "report", "entry", "system", "warranty", "purchase date", "cctv"])),
      concept("report-honestly", 2, pair(["@inform", "own up"], ["@supervisor"]), any("honest", "honestly", "truly", "truth", "own up")),
      avoids("no-hide", 1, any("hide", "hiding", "cover up")),
      concept("policy", 1, any("policy", "warranty", "as per", "rules", "return period", "covered")),
      concept("record-cause", 1, any("write", "note", "record", "log", "wrong entry", "change given", "cctv", "next time")),
    ],
    [CASH_COVER_UP],
  ),
  rubric(
    "Product knowledge & selling",
    [
      concept("ask-needs", 2, pair(["ask", "find out", "understand", "know"], ["need", "use", "budget", "spend", "purpose", "who will use", "requirement"]), any("budget")),
      concept("explain-differences", 2, any("difference", "differences", "compare", "sets the two apart", "features", "pros and cons", "battery", "walk them through", "explain")),
      concept("demo", 1, any("try", "demo", "show them", "show both", "let them hold", "feel for", "working")),
      concept("recommend-fit", 2, pair(["suggest", "recommend"], ["suit", "fit", "need", "best for"]), any("even if it's the cheaper", "not just the costliest", "not just the costly", "suits them", "fits their", "better for your use")),
      concept("warranty", 1, any("warranty", "return", "exchange", "guarantee")),
      concept("check-happy", 1, any("happy", "satisfied", "comfortable with")),
    ],
    [flag("mis-sell", any("even if i don't know", "even if i dont know", "more sale", "buy the costly", "costly one is better", "costly one has better", "always the costly", "push the expensive", "lie"))],
  ),
  rubric("Store upkeep", [
    concept("restock", 2, any("restock", "refill", "stock", "shelf", "shelves")),
    concept("clean", 1, any("clean", "tidy", "wipe", "dust", "mop")),
    concept("price", 2, any("price", "label", "tag")),
    concept("organise", 1, any("organize", "arrange", "sort", "face")),
  ]),
  rubric(
    "Reliability",
    [
      concept("honest", 2, any("honest", "honestly", "truly", "truth", "own up", "admit", "transparent")),
      avoids("no-hide", 1, any("hide", "hiding", "cover up")),
      concept("report", 1, pair(["@inform"], ["@supervisor"])),
      concept("prevent", 2, any("next time", "in future", "from now", "be careful", "twice in front")),
      concept("rules", 1, any("rules", "policy", "procedure", "before leaving", "write it", "record")),
    ],
    [CASH_COVER_UP],
  ),
];
