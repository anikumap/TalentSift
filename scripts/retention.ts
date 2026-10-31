/**
 * Erase candidate data older than each organisation's retention period.
 * Run daily from cron, e.g.  15 2 * * *  cd /srv/talentsift && npm run retention
 */
import { db } from "../src/lib/db";
import { purgeExpired } from "../src/services/retention";

async function main(): Promise<number> {
  const orgs = await db.organization.findMany({ select: { id: true } });
  const now = new Date();
  let erased = 0;
  const failed: string[] = [];
  for (const org of orgs) {
    try {
      for (const r of await purgeExpired(now, org.id)) {
        erased++;
        console.log(`org ${r.orgId}: erased ${r.candidates} candidates, ${r.applications} applications, ${r.messages} messages (cutoff ${r.cutoff.toISOString()})`);
      }
    } catch (e) {
      failed.push(org.id);
      console.error(`org ${org.id}: retention failed:`, e instanceof Error ? e.message : e);
    }
  }
  if (erased === 0 && failed.length === 0) console.log("Nothing to erase.");
  return failed.length ? 1 : 0;
}

main()
  .then(async (code) => {
    await db.$disconnect();
    process.exit(code);
  })
  .catch(async (e) => {
    console.error(e);
    await db.$disconnect();
    process.exit(1);
  });
