# Grading rubric for the benchmark

Every label in `answers/*.json` is a 0–4 score for one skill, judged only on what the answer to that question says. A human grader (or an LLM given this rubric) should reach the same numbers.

## The scale (same for every skill)

| Score | Meaning |
|---|---|
| 0 | Nothing relevant to this skill, or what's said is harmful for it. |
| 1 | Touches the skill vaguely ("I will handle it", "I will tell someone") with no concrete correct action, **or** includes an unsafe/dishonest action alongside good ones. |
| 2 | One clearly correct, relevant action. |
| 3 | Several correct actions in a sensible order. |
| 4 | Complete: specific, safe, in a sensible order, and closes the loop (checks back, records, follows up). |

Rules that override the scale:

- **Unsafe or dishonest action** on a skill → that skill is at most 1 (0 if that's essentially all the answer says), even if other good actions are present.
- **Keyword lists** that name ideas without describing what the person would do ("calm, dignity, respect, safety") → at most 1.
- **Very short answers** (under 8 words) → at most 1.
- Language quality, grammar and Indian English phrasing never lower a score. Judge the actions.
- A skill the answer simply doesn't address → 0.

## What 3 and 4 need, per skill

### Caregiver
- **Patient care & dignity:** stays calm and gentle; asks/listens to why; respects the client's choice and privacy; never forces, scolds or restrains. 4 also makes the person comfortable (sits with them, reassures, keeps them warm/covered).
- **Medication & routines:** checks the medicine/dose/time against the chart or care plan; tries again later or offers with food/water; doesn't skip or double-dose on their own; records that it was refused or given. 4 also tells the nurse/doctor when a dose is missed.
- **Communication with families:** informs family and/or supervisor/agency promptly, clearly and kindly; explains what happened. 4 also follows up or keeps them updated.
- **Handling emergencies:** does **not** move or lift the person; checks breathing/consciousness/bleeding; calls 108/112 or the supervisor/doctor; keeps them still and warm; stays with them. 4 also informs family and reports what happened to the ambulance/doctor.
- **Reliability:** doesn't leave the client alone; waits/stays until cover arrives; calls the replacement and the supervisor/agency; does a proper handover. 4 also records the delay/notes in the logbook.

### Warehouse
- **Safety awareness:** stops work near the hazard; keeps people away / blocks or marks the area; reports to supervisor; doesn't fix it alone if unsafe (or uses proper equipment/forklift with help); wears PPE. 4 also checks it's fixed and/or logs the incident.
- **Teamwork:** calls colleagues to help; communicates clearly; shares/splits the work; supports others. 4 also coordinates (who does what) and thanks/updates the team.
- **Accuracy in picking & packing:** stops and doesn't ship the mismatched item; re-scans/checks the label, SKU, barcode and quantity; puts the item aside; tells supervisor/inventory. 4 also finds the correct item and records/fixes the error in the system.
- **Speed & productivity:** prioritises the most urgent orders; plans/organises the remaining work; keeps the pace without skipping checks. 4 also tells the supervisor the status/realistic finish and keeps quality checks.
- **Reliability (warehouse):** stays until the job is done / extra time if needed; doesn't leave early; honest about the status. 4 also hands over properly.

### Retail
- **Customer service:** stays calm and polite; listens; apologises; looks for a solution (repair/replace/refund per policy); never argues or blames the customer. 4 also follows up or involves the manager when needed and makes sure the customer leaves satisfied.
- **Cash handling & billing:** recounts the cash; checks bills/receipts/the register log; doesn't cover the gap with own money or hide it; reports honestly to the manager; for returns checks the bill/receipt and policy. 4 also records it / helps find the cause.
- **Reliability (retail):** honest and transparent; owns the mistake; follows the store rules. 4 also prevents it next time.
- **Product knowledge & selling:** asks what the customer needs/budget; explains the differences/features honestly; recommends based on needs, not just the costlier one; lets them try/see. 4 also checks they're happy and mentions warranty/returns.

### Driver
- **Customer interaction:** calls/messages the customer politely; waits a reasonable time; asks neighbours/guard politely. 4 also informs them of the next step (reschedule, where the parcel is).
- **Handling problems on the road:** checks the address/map/landmarks; contacts customer and dispatcher/support; follows company process (reattempt, return to hub); for damage: doesn't deliver silently, takes photos, reports, records. 4 also records the outcome/updates the app.
- **Route planning & punctuality:** re-plans the route; prioritises urgent/nearby deliveries; informs customers/dispatcher about delays. 4 also keeps parcels dry/protected and updates ETA.
- **Safe driving:** slows down; avoids flooded roads; uses raincoat/lights; stops/pulls over if unsafe; never speeds or uses the phone while driving. 4 also prioritises safety over targets explicitly.
- **Reliability (driver):** completes deliveries honestly; reports issues instead of hiding them. 4 also records proof and follows through.

### Kitchen helper (generic set)
- **Food hygiene:** washes hands; uses gloves/hairnet; keeps raw and cooked separate; cleans surfaces/tools; throws away spoiled food. 4 also tells the chef and labels/stores food correctly.
- **Speed in prep:** plans/prioritises orders; preps ahead; keeps the station organised. 4 also communicates timing with the chef.
- **Teamwork:** helps colleagues; communicates; follows the chef's instructions. 4 also coordinates and updates.
