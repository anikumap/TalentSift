import type { MustHaveDraft, QuestionDraft, SkillDraft } from "../types";

export type RoleTemplate = {
  family: string;
  match: RegExp;
  skills: SkillDraft[];
  mustHaves: MustHaveDraft[];
  questions: QuestionDraft[];
};

export const TEMPLATES: RoleTemplate[] = [
  {
    family: "caregiver",
    match: /\b(care ?giver|carer|caretaker|nurse aide|attendant|gda|home care|elder ?care|patient care)\b/i,
    skills: [
      { name: "Patient care & dignity", description: "Helps with daily living while keeping the person comfortable, safe and respected.", weight: 30, keywords: ["calm", "comfort", "dignity", "respect", "privacy", "gently", "safe", "safety", "patient"] },
      { name: "Medication & routines", description: "Follows medicine schedules and care plans accurately.", weight: 25, keywords: ["medicine", "medication", "dose", "schedule", "time", "chart", "doctor", "record"] },
      { name: "Communication with families", description: "Keeps family and supervisors informed clearly and kindly.", weight: 20, keywords: ["family", "inform", "explain", "call", "update", "listen", "supervisor", "tell"] },
      { name: "Handling emergencies", description: "Recognises warning signs and acts quickly and correctly.", weight: 15, keywords: ["emergency", "ambulance", "first aid", "cpr", "fall", "breathing", "hospital", "112", "108"] },
      { name: "Reliability", description: "Shows up on time and finishes shifts responsibly.", weight: 10, keywords: ["on time", "punctual", "handover", "reliable", "notes", "shift", "responsible"] },
    ],
    mustHaves: [
      { label: "Basic first aid or caregiving certificate", kind: "LICENSE", question: "Do you have a first aid, GDA or caregiving certificate (or are willing to get one in 30 days)?" },
      { label: "Can work the listed shifts", kind: "AVAILABILITY", question: "Can you work the shifts listed for this job?" },
    ],
    questions: [
      { prompt: "An elderly client refuses to take their evening medicine and gets upset. What do you do, step by step?", skillNames: ["Patient care & dignity", "Medication & routines", "Communication with families"] },
      { prompt: "You find your client on the floor and they say their hip hurts badly. Describe exactly what you do in the next 10 minutes.", skillNames: ["Handling emergencies", "Patient care & dignity"] },
      { prompt: "Your replacement is 40 minutes late for the night shift. How do you handle it?", skillNames: ["Reliability", "Communication with families"] },
    ],
  },
  {
    family: "warehouse",
    match: /\b(warehouse|picker|packer|loader|forklift|inventory|stock ?keeper|logistics associate|fulfil?ment)\b/i,
    skills: [
      { name: "Safety awareness", description: "Follows safe handling, lifting and equipment rules.", weight: 30, keywords: ["safety", "safe", "ppe", "helmet", "gloves", "report", "supervisor", "lift", "careful"] },
      { name: "Accuracy in picking & packing", description: "Picks the right item and quantity, checks labels.", weight: 25, keywords: ["check", "scan", "label", "count", "correct", "verify", "barcode", "sku", "double"] },
      { name: "Speed & productivity", description: "Keeps pace with targets without cutting corners.", weight: 20, keywords: ["target", "fast", "quick", "plan", "organise", "organize", "route", "priority"] },
      { name: "Teamwork", description: "Helps colleagues and communicates during busy shifts.", weight: 15, keywords: ["team", "help", "colleague", "together", "communicate", "share", "support"] },
      { name: "Reliability", description: "Arrives on time and completes shifts.", weight: 10, keywords: ["on time", "punctual", "attendance", "reliable", "shift", "responsible"] },
    ],
    mustHaves: [
      { label: "Can work the listed shifts", kind: "AVAILABILITY", question: "Can you work the shifts listed for this job?" },
      { label: "Comfortable standing and moving for most of the shift", kind: "OTHER", question: "Are you comfortable standing and moving for most of a shift (with breaks)?" },
    ],
    questions: [
      { prompt: "You notice a pallet stacked unsafely near a walkway during a busy shift. What do you do?", skillNames: ["Safety awareness", "Teamwork"] },
      { prompt: "The scanner shows an item that doesn't match the label on the box. How do you handle it?", skillNames: ["Accuracy in picking & packing", "Speed & productivity"] },
      { prompt: "Your team is behind target with one hour left. What would you do?", skillNames: ["Speed & productivity", "Teamwork", "Reliability"] },
    ],
  },
  {
    family: "retail",
    match: /\b(retail|cashier|store|shop|sales associate|sales assistant|counter|billing executive)\b/i,
    skills: [
      { name: "Customer service", description: "Greets, helps and resolves customer problems politely.", weight: 30, keywords: ["customer", "greet", "smile", "help", "sorry", "apologise", "apologize", "listen", "polite"] },
      { name: "Cash handling & billing", description: "Handles payments and returns accurately.", weight: 25, keywords: ["cash", "count", "upi", "card", "receipt", "bill", "change", "refund", "manager"] },
      { name: "Product knowledge & selling", description: "Explains products and suggests the right options.", weight: 20, keywords: ["product", "suggest", "recommend", "explain", "offer", "size", "stock", "compare"] },
      { name: "Store upkeep", description: "Keeps shelves stocked, tidy and correctly priced.", weight: 15, keywords: ["shelf", "clean", "tidy", "price", "display", "restock", "arrange"] },
      { name: "Reliability", description: "On time, honest and dependable.", weight: 10, keywords: ["on time", "punctual", "honest", "reliable", "shift", "responsible"] },
    ],
    mustHaves: [
      { label: "Can work weekends and festival seasons", kind: "AVAILABILITY", question: "Can you work weekends and during festival seasons?" },
    ],
    questions: [
      { prompt: "A customer is angry because the item they bought last week stopped working. How do you respond?", skillNames: ["Customer service", "Cash handling & billing"] },
      { prompt: "At closing, your cash drawer is ₹200 short. What do you do?", skillNames: ["Cash handling & billing", "Reliability"] },
      { prompt: "A customer can't decide between two products. How do you help them choose?", skillNames: ["Product knowledge & selling", "Customer service"] },
    ],
  },
  {
    family: "driver",
    match: /\b(driver|delivery|rider|courier|chauffeur|delivery executive)\b/i,
    skills: [
      { name: "Safe driving", description: "Follows traffic rules and drives defensively.", weight: 30, keywords: ["safe", "helmet", "seatbelt", "speed", "traffic", "rules", "careful", "signal"] },
      { name: "Route planning & punctuality", description: "Plans routes and delivers on time.", weight: 25, keywords: ["route", "map", "plan", "time", "late", "traffic", "eta", "order"] },
      { name: "Customer interaction", description: "Polite and clear with customers at the door.", weight: 20, keywords: ["customer", "call", "polite", "inform", "sorry", "greet", "otp"] },
      { name: "Handling problems on the road", description: "Deals with breakdowns, wrong addresses and damaged parcels.", weight: 15, keywords: ["breakdown", "puncture", "address", "damaged", "support", "report", "photo", "manager"] },
      { name: "Reliability", description: "Shows up and completes assigned deliveries.", weight: 10, keywords: ["on time", "punctual", "reliable", "shift", "responsible", "complete"] },
    ],
    mustHaves: [
      { label: "Valid driving licence", kind: "LICENSE", question: "Do you have a valid driving licence for the vehicle this job needs?" },
      { label: "Can work the listed shifts", kind: "AVAILABILITY", question: "Can you work the shifts listed for this job?" },
    ],
    questions: [
      { prompt: "You reach the address but the customer isn't answering and the building has no name board. What do you do?", skillNames: ["Customer interaction", "Handling problems on the road"] },
      { prompt: "You have 8 deliveries and heavy rain starts. How do you plan the rest of your shift?", skillNames: ["Route planning & punctuality", "Safe driving"] },
      { prompt: "A parcel looks damaged when you pick it up. How do you handle it?", skillNames: ["Handling problems on the road", "Reliability"] },
    ],
  },
];
