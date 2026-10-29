import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { resetDb } from "../setup/db";

describe("database harness", () => {
  beforeEach(resetDb);

  it("stores and reads an organization", async () => {
    const org = await db.organization.create({ data: { name: "Acme Care" } });
    const found = await db.organization.findUnique({ where: { id: org.id } });
    expect(found?.name).toBe("Acme Care");
    expect(found?.retentionDays).toBe(365);
  });

  it("resetDb empties every table", async () => {
    await db.organization.create({ data: { name: "Temp" } });
    await resetDb();
    expect(await db.organization.count()).toBe(0);
  });
});
