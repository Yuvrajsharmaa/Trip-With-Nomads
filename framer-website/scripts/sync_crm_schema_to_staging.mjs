#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const STAGING_PROJECT_REF = "ieuwiinbvbdvjrdqqzlb";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function run(cmd, args) {
  execFileSync(cmd, args, { stdio: "inherit" });
}

function main() {
  console.log(`Linking Supabase CLI to staging project ${STAGING_PROJECT_REF}...`);
  run("supabase", ["link", "--project-ref", STAGING_PROJECT_REF]);

  console.log("Applying all pending migrations to staging...");
  run("supabase", ["db", "push", "--linked"]);

  console.log("Verifying CRM schema parity on staging...");
  run("node", [path.join(__dirname, "verify_crm_schema_parity.mjs")]);

  console.log("Staging CRM schema sync completed.");
}

main();
