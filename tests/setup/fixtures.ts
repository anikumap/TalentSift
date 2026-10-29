import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { signup } from "@/services/auth";
import type { Actor } from "@/lib/rbac";
import type { Role } from "@/domain/constants";
import type { IntakeAnswers } from "@/providers/types";

let counter = 0;

export async function makeAdmin(orgName = "Sunrise Care"): Promise<Actor> {
  counter += 1;
  return signup({ orgName, name: "Asha Rao", email: `admin${counter}@test.dev`, password: "secret123" });
}

export async function addMember(admin: Actor, role: Role): Promise<Actor> {
  counter += 1;
  const user = await db.user.create({
    data: {
      orgId: admin.orgId,
      email: `member${counter}@test.dev`,
      name: `Member ${counter}`,
      role,
      passwordHash: await bcrypt.hash("x", 4),
    },
  });
  return { id: user.id, orgId: user.orgId, role, name: user.name };
}

export const caregiverIntake: IntakeAnswers = {
  title: "Home Caregiver",
  location: "Pune",
  tasks: "help with bathing, give medicines on time, keep notes",
  mustHaves: "Weekend availability",
  payMin: 18000,
  payMax: 24000,
  shifts: "Day and night shifts",
};
