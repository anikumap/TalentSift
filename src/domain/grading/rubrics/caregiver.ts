import type { Rubric } from "../grade";
import { any, avoids, concept, flag, pair, rubric } from "./helpers";

const FORCE_MEDICINE = flag("force-medicine", pair(["force", "push", "shove", "put", "stuff"], ["mouth", "throat"]), pair(["force", "push"], ["tablet", "medicine", "pill", "dose"]));
const HARSH = flag("harsh", any("be strict", "scold", "shout at", "yell at", "slap", "threaten", "tie her", "tie him", "lock her", "lock him", "firmly"));
const MOVE_INJURED = flag(
  "move-injured",
  any("lift her", "lift him", "pick her up", "pick him up", "help her stand", "help him stand", "make her stand", "make him stand", "walk her", "walk him", "put her on the bed", "put him on the bed", "carry her", "carry him", "drag her", "drag him", "pull her", "pull him"),
);
const SELF_TREAT = flag("self-treat", any("painkiller", "balm", "massage", "rub the hip", "rub it"));
const LEAVE_CLIENT = flag("leave-client", any("leave at the time", "leave on time", "leave early", "go home", "walk out", "shift is over", "leave the client", "leave her alone", "leave him alone"));

export const CAREGIVER_RUBRICS: Rubric[] = [
  rubric(
    "Patient care & dignity",
    [
      concept("calm", 2, any("@calm", "low voice", "voice low", "nicely")),
      concept("ask-why", 2, pair(["ask", "listen", "understand", "find out"], ["why", "reason", "wrong", "bother", "problem", "hurt", "feel", "upset", "matter"]), any("what's wrong", "what is wrong")),
      avoids("no-force", 2, any("force", "push", "compel", "pressure", "restrain", "argue", "shout", "scold", "fight")),
      concept("respect", 1, any("respect", "dignity", "privacy", "her choice", "his choice", "her wish", "his wish")),
      concept("comfort", 1, any("comfort", "comfortable", "sit with", "sit beside", "sit near", "hold her hand", "hold his hand", "blanket", "shawl", "pillow", "warm", "help is coming", "panic")),
      concept("explain", 1, any("explain", "convince", "persuade")),
    ],
    [FORCE_MEDICINE, HARSH],
  ),
  rubric(
    "Medication & routines",
    [
      concept("check-dose", 2, pair(["@check", "make sure"], ["chart", "dose", "dosage", "time", "tablet", "medicine", "prescription", "care plan", "box", "label", "right"])),
      concept("retry", 2, pair(["try", "offer", "give"], ["again", "later", "after", "with"], 4), any("second try", "try again", "again try", "after some time")),
      concept("record", 2, any("write", "note", "record", "log", "mark", "document", "jot", "notes")),
      concept("inform-clinician", 1, pair(["@inform", "let"], ["nurse", "doctor", "@supervisor"])),
      avoids("no-skip", 1, any("skip", "double", "extra dose", "two tablets", "force")),
      concept("purpose", 1, pair(["explain", "tell"], ["medicine", "tablet", "important", "health", "bp", "sugar", "for"])),
    ],
    [FORCE_MEDICINE, flag("dose-change", any("double dose", "give two", "skip the dose", "skip it", "throw it", "throw the tablet"))],
  ),
  rubric("Communication with families", [
    concept("inform-family", 2, pair(["@inform", "explain", "update"], ["@family", "him", "them"]), any("so he knows", "so she knows", "so they know")),
    concept("inform-supervisor", 1, pair(["@inform", "let"], ["@supervisor", "agency", "nurse"])),
    concept("explain-what", 1, pair(["explain", "tell", "fill"], ["what happened", "everything", "all the things", "details", "how i found", "situation", "delay", "in on"])),
    concept("follow-up", 2, any("keep them updated", "keep updating", "follow up", "update them", "call back", "check back", "keep informed", "check with her again", "check with him again")),
    concept("kind", 1, pair(["@inform", "explain"], ["kindly", "politely", "calmly", "clearly", "gently"])),
  ]),
  rubric(
    "Handling emergencies",
    [
      avoids("no-move", 2, any("move", "lift", "pick up", "get her up", "get him up", "stand", "pull", "drag", "shift")),
      concept("keep-still", 1, any("where she is", "where he is", "on the floor", "on floor", "keep her still", "keep him still")),
      concept("check-vitals", 2, pair(["@check", "see", "ask"], ["breathing", "breath", "conscious", "talking", "responding", "bleeding", "head", "where it hurts"])),
      concept("call-emergency", 2, any("108", "112", "102", "ambulance", "hospital", "doctor", "emergency number")),
      concept("inform", 1, pair(["@inform"], ["@supervisor", "@family", "office", "agency"])),
      concept("warm", 1, any("blanket", "shawl", "warm", "pillow", "cover her", "cover him", "help is coming", "reassure", "hold her hand", "hold his hand")),
      concept("stay", 1, any("stay with", "sit near", "sit with", "stay near", "sit beside", "till ambulance", "until ambulance", "till the ambulance", "until the ambulance", "till help")),
      concept("report-details", 1, any("how i found", "what happened", "what time")),
    ],
    [MOVE_INJURED, SELF_TREAT],
  ),
  rubric(
    "Reliability",
    [
      concept("stay", 2, any("@wait", "stick around", "hang on")),
      avoids("no-leave", 1, any("leave", "go home", "walk out", "go")),
      concept("call-replacement", 2, pair(["@inform"], ["replacement", "relief", "her", "him", "next person", "night person", "colleague", "carer"], 4)),
      concept("inform-supervisor", 1, pair(["@inform"], ["@supervisor", "agency", "office"])),
      concept("handover", 2, any("handover", "hand over", "fill her in", "fill him in", "explain everything", "tell her all", "tell him all", "everything that happened", "all the things", "brief her", "brief him")),
      concept("record", 1, any("write", "note", "record", "log", "register", "logbook", "jot", "book", "diary")),
    ],
    [LEAVE_CLIENT],
  ),
];
