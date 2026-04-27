#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PROD_PROJECT_REF = "jxozzvwvprmnhvafmpsa";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function run(cmd, args) {
  execFileSync(cmd, args, { stdio: "inherit" });
}

function main() {
  if (!process.argv.includes("--confirm")) {
    console.error("Refusing to run production cleanup without --confirm.");
    process.exit(1);
  }

  const sqlPath = path.resolve(
    __dirname,
    "../supabase/runbooks/production_profiles_only_cleanup.sql"
  );

  console.log(`Linking Supabase CLI to production project ${PROD_PROJECT_REF}...`);
  run("supabase", ["link", "--project-ref", PROD_PROJECT_REF]);

  console.log("Executing production profiles-only cleanup SQL...");
  run("supabase", ["db", "query", "--linked", "--file", sqlPath]);

  console.log("Production cleanup completed.");
}

main();
