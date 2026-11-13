import mongoose from "mongoose";
import { env } from "../config/env.js";
import { runWorkspaceMigration } from "./workspace-migration.js";

const execute = process.argv.includes("--execute");

const run = async () => {
  await mongoose.connect(env.MONGODB_URI);
  console.log(
    `Workspace migration (${execute ? "EXECUTE" : "dry-run"}) on ${mongoose.connection.name}`,
  );
  const report = await runWorkspaceMigration({ execute, log: (message) => console.log(message) });
  console.log(JSON.stringify(report, null, 2));
  if (!execute) {
    console.log("Dry-run only. Re-run with --execute to apply these changes.");
  } else if (!report.verification.passed) {
    console.error("Verification failed. Review the report and re-run; the migration is resumable.");
    process.exitCode = 1;
  } else {
    console.log("Migration complete and verified.");
  }
  await mongoose.disconnect();
};

run().catch(async (error: unknown) => {
  console.error("Migration failed:", error instanceof Error ? error.message : error);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
