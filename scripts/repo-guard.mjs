#!/usr/bin/env node

import { execSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const mode = process.argv[2] || "ci";

const GENERATED_PREFIXES = [
  ".open-next/",
  ".next/",
  ".wrangler/",
  "build/",
  "dist/",
  "coverage/",
  "framer-website/.open-next/",
  "framer-website/.next/",
  "framer-website/.wrangler/",
  "framer-website/.tmp/",
  "framer-website/supabase/.temp/",
  "supabase/.temp/",
  "skills-main/",
];
const GENERATED_EXACT = new Set(["tsconfig.tsbuildinfo", "framer-website/tsconfig.tsbuildinfo"]);
const POLICY_PATH = ".branch-policy.json";

function run(cmd) {
  return execSync(cmd, { encoding: "utf8" }).trim();
}

function runAllowFail(cmd) {
  const result = spawnSync(cmd, {
    shell: true,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "ignore"],
  });
  if (result.status !== 0) {
    return "";
  }
  return (result.stdout || "").trim();
}

function runZ(cmd) {
  return execSync(cmd, { encoding: "buffer" });
}

function parseNulList(buffer) {
  return buffer
    .toString("utf8")
    .split("\u0000")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function loadPolicy() {
  if (!existsSync(POLICY_PATH)) {
    return {
      active_feature_branch: "",
      allowed_long_lived_branches: ["main", "staging"],
      allowed_feature_prefixes: ["codex/", "feat/", "fix/", "chore/", "hotfix/"],
      protected_quarantine_patterns: ["^codex/wip-quarantine-", "^antigravity/wip-quarantine-", "^wip-quarantine-"],
    };
  }

  try {
    const parsed = JSON.parse(readFileSync(POLICY_PATH, "utf8"));
    return {
      active_feature_branch: String(parsed.active_feature_branch || ""),
      allowed_long_lived_branches: Array.isArray(parsed.allowed_long_lived_branches)
        ? parsed.allowed_long_lived_branches
        : ["main", "staging"],
      allowed_feature_prefixes: Array.isArray(parsed.allowed_feature_prefixes)
        ? parsed.allowed_feature_prefixes
        : ["codex/", "feat/", "fix/", "chore/", "hotfix/"],
      protected_quarantine_patterns: Array.isArray(parsed.protected_quarantine_patterns)
        ? parsed.protected_quarantine_patterns
        : ["^codex/wip-quarantine-", "^antigravity/wip-quarantine-", "^wip-quarantine-"],
    };
  } catch {
    return {
      active_feature_branch: "",
      allowed_long_lived_branches: ["main", "staging"],
      allowed_feature_prefixes: ["codex/", "feat/", "fix/", "chore/", "hotfix/"],
      protected_quarantine_patterns: ["^codex/wip-quarantine-", "^antigravity/wip-quarantine-", "^wip-quarantine-"],
    };
  }
}

function isGeneratedPath(filePath) {
  const normalized = filePath.replaceAll("\\", "/");
  if (GENERATED_EXACT.has(normalized)) return true;
  return GENERATED_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

function hasDuplicateSuffix(filePath) {
  const normalized = filePath.replaceAll("\\", "/");
  return normalized.split("/").some((segment) => / [0-9]+(?:\.[^/]+)?$/.test(segment));
}

function hasConflictMarkers(filePath) {
  if (!existsSync(filePath)) return false;
  try {
    const content = readFileSync(filePath, "utf8");
    return /^(<<<<<<<(?: .*)?|=======|>>>>>>>.*)$/m.test(content);
  } catch {
    return false;
  }
}

function uniqueSorted(values) {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function printList(title, values) {
  if (values.length === 0) return;
  console.error(`\n${title}`);
  for (const value of values) {
    console.error(`- ${value}`);
  }
}

function failIfAny(files, label) {
  if (files.length > 0) {
    printList(label, uniqueSorted(files));
    return true;
  }
  return false;
}

function guardPaths(paths, sourceLabel) {
  const generated = paths.filter(isGeneratedPath);
  const duplicates = paths.filter(hasDuplicateSuffix);
  const conflicts = paths.filter(hasConflictMarkers);

  let failed = false;
  failed = failIfAny(generated, `${sourceLabel}: generated/runtime artifacts are not allowed`) || failed;
  failed = failIfAny(duplicates, `${sourceLabel}: accidental duplicate-suffixed paths are not allowed`) || failed;
  failed = failIfAny(conflicts, `${sourceLabel}: unresolved conflict markers detected`) || failed;
  return failed;
}

function matchesAnyRegex(branch, patternList) {
  return patternList.some((pattern) => {
    try {
      return new RegExp(pattern).test(branch);
    } catch {
      return false;
    }
  });
}

function guardBranchForPush() {
  const policy = loadPolicy();
  const branch = process.env.REPO_GUARD_BRANCH || run("git rev-parse --abbrev-ref HEAD");
  let failed = false;

  if ((policy.allowed_long_lived_branches || []).includes(branch)) {
    console.error(`\nProtected branch push blocked: ${branch}`);
    console.error("Create or use the active feature branch and open a PR.");
    failed = true;
  }

  const allowedPrefixes = policy.allowed_feature_prefixes || [];
  if (!allowedPrefixes.some((prefix) => branch.startsWith(prefix))) {
    console.error(`\nBranch naming blocked: ${branch}`);
    console.error(`Allowed prefixes: ${allowedPrefixes.join(", ")}`);
    failed = true;
  }

  const quarantine = matchesAnyRegex(branch, policy.protected_quarantine_patterns || []);
  const activeBranch = String(policy.active_feature_branch || "").trim();
  const emergency = branch.startsWith("hotfix/");

  if (!quarantine && !emergency && activeBranch && branch !== activeBranch) {
    console.error(`\nBranch policy blocked: ${branch}`);
    console.error(`Only active feature branch may be pushed: ${activeBranch}`);
    failed = true;
  }

  const staleRefs = runAllowFail("git remote prune origin --dry-run");
  if (staleRefs) {
    console.error("\nPush blocked: stale remote-tracking refs detected.");
    console.error("Run: git fetch origin --prune");
    failed = true;
  }

  const dirty = runAllowFail("git status --porcelain");
  if (dirty) {
    console.error("\nPush blocked: working tree is not clean.");
    console.error("Commit or stash local changes before pushing.");
    failed = true;
  }

  const upstream = runAllowFail("git rev-parse --abbrev-ref --symbolic-full-name @{u}");
  if (upstream) {
    const counts = runAllowFail(`git rev-list --left-right --count ${upstream}...HEAD`);
    if (counts) {
      const [behindText] = counts.split(/\s+/);
      const behind = Number.parseInt(behindText, 10);
      if (Number.isFinite(behind) && behind > 0) {
        console.error(`\nPush blocked: local branch is behind upstream (${upstream}).`);
        console.error("Run git pull --ff-only before pushing.");
        failed = true;
      }
    }
  }

  return failed;
}

function getPathsForMode() {
  if (mode === "pre-commit") {
    return parseNulList(runZ("git diff --cached --name-only --diff-filter=ACMR -z"));
  }

  if (mode === "pre-push") {
    const upstream = runAllowFail("git rev-parse --abbrev-ref --symbolic-full-name @{u}") || "origin/main";
    const cmd = `git diff --name-only --diff-filter=ACMR ${upstream}...HEAD -z`;
    return parseNulList(runZ(cmd));
  }

  return parseNulList(runZ("git ls-files -z"));
}

function main() {
  if (!["pre-commit", "pre-push", "ci"].includes(mode)) {
    console.error(`Unknown mode: ${mode}. Use one of: pre-commit, pre-push, ci`);
    process.exit(2);
  }

  const paths = getPathsForMode();
  const label = mode === "ci" ? "Tracked files" : mode === "pre-push" ? "Push range files" : "Staged files";

  let failed = false;

  if (mode === "pre-push") {
    failed = guardBranchForPush() || failed;
  }

  failed = guardPaths(paths, label) || failed;

  if (failed) {
    console.error("\nrepo-guard failed.");
    process.exit(1);
  }

  console.log(`repo-guard passed (${mode}).`);
}

main();
