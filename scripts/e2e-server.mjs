// Starts a production build of TalentSift against a fresh, throwaway e2e database.
import { execSync, spawn } from "node:child_process";
import { rmSync } from "node:fs";

const env = { ...process.env, DATABASE_URL: "file:./e2e.db", APP_URL: "http://localhost:3100" };
for (const f of ["prisma/e2e.db", "prisma/e2e.db-journal"]) rmSync(f, { force: true });

execSync("npx prisma db push --skip-generate", { env, stdio: "inherit" });
if (!process.env.E2E_SKIP_BUILD) execSync("npx next build", { env, stdio: "inherit" });

const server = spawn("npx", ["next", "start", "-p", "3100"], { env, stdio: "inherit", shell: true });
const stop = () => server.kill();
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
server.on("exit", (code) => process.exit(code ?? 0));
