import type { Rubric } from "../grade";
import { any, avoids, concept, flag, pair, rubric } from "./helpers";

const FAKE_DELIVERY = flag("fake-delivery", any("leave the parcel", "leave it outside", "outside the gate", "mark it delivered", "mark delivered", "throw it"));
const HIDE_DAMAGE = flag("hide-damage", any("tape it", "looks okay", "nobody will know", "no one will know", "not my problem"));

export const DRIVER_RUBRICS: Rubric[] = [
  rubric(
    "Safe driving",
    [
      concept("slow", 2, any("slow", "slowly", "take it easy", "careful", "carefully", "easy on", "reduce speed")),
      avoids("no-rush", 1, any("rush", "speed", "fast", "hurry")),
      concept("avoid-flood", 2, any("flooded", "stay off", "water-logged", "waterlogged", "avoid water", "water logged")),
      concept("gear", 1, any("raincoat", "helmet", "lights", "headlights", "rain gear")),
      concept("stop-if-unsafe", 2, any("shelter", "pull over", "wait for rain", "stop under", "stop to")),
      avoids("no-phone", 1, any("phone", "use the phone", "mobile")),
      concept("safety-first", 1, any("safety is more important", "safety first", "safety over", "more important than the target")),
    ],
    [flag("unsafe-riding", any("drive fast", "ride fast", "same speed", "go through the water", "through the water", "on phone while", "phone while riding", "phone while driving", "target must", "speed up", "overtake"))],
  ),
  rubric("Route planning & punctuality", [
    concept("replan", 2, any("route", "re-plan", "replan", "reroute", "avoid flooded", "stay off", "water-logged", "map")),
    concept("prioritise", 2, any("nearest", "nearby", "closest", "near ones", "priority", "prioritize", "urgent", "sort the drops", "first")),
    concept("inform-delay", 2, pair(["@inform", "message", "update"], ["customer", "dispatcher", "delay", "late", "behind"]), any("heads-up", "running behind", "may be late", "delay")),
    concept("protect", 1, any("cover the parcels", "parcels covered", "parcel cover", "plastic", "dry")),
    concept("eta", 1, any("eta", "minutes late", "update the dispatcher", "update dispatcher")),
  ]),
  rubric(
    "Customer interaction",
    [
      concept("contact", 2, pair(["@inform", "try calling", "text", "sms"], ["customer", "them", "him", "her", "person"], 4), any("sms", "drop a text", "send a message", "try calling", "calling")),
      concept("wait", 1, any("wait", "10 minutes", "some time", "few minutes")),
      concept("ask-around", 2, pair(["ask", "check with"], ["guard", "security", "neighbour", "neighbor", "watchman", "shop", "nearby", "around", "people"]), any("ask around")),
      concept("polite", 1, any("@calm")),
      concept("next-step", 2, any("reattempt", "re-attempt", "next day", "tomorrow", "another try", "come back", "reschedule")),
    ],
    [FAKE_DELIVERY],
  ),
  rubric(
    "Handling problems on the road",
    [
      concept("verify-address", 2, pair(["@check", "use"], ["map", "address", "location", "pin", "landmark"]), any("landmark", "map pin")),
      concept("contact-ops", 2, pair(["@inform", "flag", "get in touch", "show"], ["dispatcher", "support", "hub", "office", "@supervisor", "warehouse"])),
      concept("process", 1, any("process", "reattempt", "return the parcel", "take it back", "return it", "back to hub", "whatever they say", "follow", "new parcel", "come back", "next day", "another try", "tomorrow")),
      concept("photos", 2, any("@photo", "snap")),
      concept("record", 2, any("mark it", "in the app", "on the app", "update the app", "log it", "note it", "noted", "record", "mark the reason", "note their decision")),
      avoids("no-silent-delivery", 1, any("hand it over", "deliver", "take it as normal", "as if nothing", "take")),
      concept("show-customer", 1, any("show the customer", "show the damage", "let them decide", "accept or refuse")),
    ],
    [FAKE_DELIVERY, HIDE_DAMAGE],
  ),
  rubric(
    "Reliability",
    [
      concept("report", 2, pair(["@inform", "flag", "show"], ["@supervisor", "hub", "dispatcher", "warehouse"]), any("report", "honest")),
      concept("proof", 2, any("@photo", "snap")),
      concept("record", 2, any("in the app", "on the app", "log it", "note it", "noted", "record", "mark it")),
      concept("follow-through", 1, any("follow whatever", "follow their", "note their decision", "let them decide", "before leaving", "before i leave")),
    ],
    [HIDE_DAMAGE],
  ),
];
