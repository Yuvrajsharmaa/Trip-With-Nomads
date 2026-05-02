#!/usr/bin/env node

import { chmodSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";

const repoRoot = process.cwd();
const hooksDir = resolve(repoRoot, ".githooks");
const requiredHooks = ["pre-commit", "pre-push"];

for (const hook of requiredHooks) {
  const hookPath = resolve(hooksDir, hook);
  if (!existsSync(hookPath)) {
    console.error(`Missing hook file: ${hookPath}`);
    process.exit(1);
  }
  chmodSync(hookPath, 0o755);
}

execSync("git config core.hooksPath .githooks", { stdio: "inherit" });
execSync("git config pull.ff only", { stdio: "inherit" });
execSync("git config fetch.prune true", { stdio: "inherit" });

console.log("Git hooks installed: .githooks (pre-commit, pre-push)");
console.log("Git sync defaults set: pull.ff=only, fetch.prune=true");
