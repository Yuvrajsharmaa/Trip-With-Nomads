#!/usr/bin/env node

import { execSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const POLICY_PATH = ".branch-policy.json";
const [command, ...args] = process.argv.slice(2);

function run(cmd, options = {}) {
  const output = execSync(cmd, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], ...options });
  if (typeof output !== "string") return "";
  return output.trim();
}

function runAllowFail(cmd) {
  const result = spawnSync(cmd, { shell: true, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
  return {
    code: result.status ?? 1,
    stdout: (result.stdout || "").trim(),
    stderr: (result.stderr || "").trim(),
  };
}

function todayStamp() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = `${now.getMonth() + 1}`.padStart(2, "0");
  const dd = `${now.getDate()}`.padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

function daysAgo(unixSeconds) {
  const now = Date.now() / 1000;
  return Math.floor((now - Number(unixSeconds)) / 86400);
}

function parseArg(flag) {
  const idx = args.indexOf(flag);
  if (idx === -1) return null;
  return args[idx + 1] ?? null;
}

function hasArg(flag) {
  return args.includes(flag);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function sanitizeTagPart(value) {
  return String(value || "")
    .trim()
    .replaceAll(" ", "-")
    .replace(/[^a-zA-Z0-9._\/-]/g, "-")
    .replace(/\/{2,}/g, "/")
    .replace(/^\/+|\/+$/g, "");
}

function repoSlug() {
  return run("basename $(git rev-parse --show-toplevel)").toLowerCase();
}

function ensureCleanWorktreeForSwitch() {
  const dirty = runAllowFail("git status --porcelain");
  if (dirty.stdout) {
    fail("Working tree is dirty. Commit or stash before branch activation.");
  }
}

function loadPolicy() {
  if (!existsSync(POLICY_PATH)) {
    fail(`Missing ${POLICY_PATH}.`);
  }
  try {
    return JSON.parse(readFileSync(POLICY_PATH, "utf8"));
  } catch (error) {
    fail(`Invalid JSON in ${POLICY_PATH}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function savePolicy(policy) {
  writeFileSync(POLICY_PATH, `${JSON.stringify(policy, null, 2)}\n`, "utf8");
}

function buildQuarantineRegexes(policy) {
  return (policy.protected_quarantine_patterns || []).map((entry) => new RegExp(entry));
}

function isQuarantineBranch(branch, policy) {
  return buildQuarantineRegexes(policy).some((re) => re.test(branch));
}

function isLongLivedBranch(branch, policy) {
  return (policy.allowed_long_lived_branches || []).includes(branch);
}

function isAllowedFeatureBranch(branch, policy) {
  return (policy.allowed_feature_prefixes || []).some((prefix) => branch.startsWith(prefix));
}

function activateBranch() {
  const branch = args[0];
  if (!branch) {
    fail("Usage: npm run branch:activate -- <branch> --owner codex|antigravity");
  }

  const owner = parseArg("--owner") || "codex";
  const policy = loadPolicy();

  if (isLongLivedBranch(branch, policy)) {
    fail(`Cannot activate long-lived branch: ${branch}`);
  }
  if (!isAllowedFeatureBranch(branch, policy)) {
    fail(`Branch name not allowed: ${branch}`);
  }

  ensureCleanWorktreeForSwitch();
  run("git fetch origin --prune");

  const hasLocal = runAllowFail(`git show-ref --verify --quiet refs/heads/${branch}`).code === 0;
  const hasRemote = runAllowFail(`git show-ref --verify --quiet refs/remotes/origin/${branch}`).code === 0;

  if (hasLocal) {
    run(`git checkout ${branch}`, { stdio: "inherit" });
  } else if (hasRemote) {
    run(`git checkout -b ${branch} --track origin/${branch}`, { stdio: "inherit" });
  } else {
    run(`git checkout -b ${branch}`, { stdio: "inherit" });
  }

  policy.active_feature_branch = branch;
  policy.active_owner = owner;
  policy.handoff_note = `Activated by ${owner}`;
  policy.updated_at = new Date().toISOString();
  savePolicy(policy);

  console.log(`Active feature branch set to ${branch} (owner: ${owner}).`);
}

function handoffBranch() {
  const owner = parseArg("--to");
  if (!owner) {
    fail("Usage: npm run branch:handoff -- --to codex|antigravity [--note \"message\"]");
  }
  const note = parseArg("--note") || "";
  const policy = loadPolicy();

  if (!policy.active_feature_branch) {
    fail("No active_feature_branch set in .branch-policy.json");
  }

  policy.active_owner = owner;
  policy.handoff_note = note || `Handed to ${owner}`;
  policy.handoff_at = new Date().toISOString();
  savePolicy(policy);

  console.log(`Branch handoff recorded: ${policy.active_feature_branch} -> ${owner}`);
}

function parseRefRows(prefix) {
  const raw = runAllowFail(
    `git for-each-ref --format='%(refname:short)|%(objectname)|%(committerdate:unix)' ${prefix}`
  ).stdout;
  if (!raw) return [];
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, sha, unix] = line.split("|");
      return { name, sha, unix: Number(unix) || 0 };
    });
}

function hasOpenPrForBranch(branch) {
  const result = runAllowFail(`gh pr list --head ${branch} --state open --json number --jq 'length'`);
  if (result.code !== 0) {
    return false;
  }
  return Number(result.stdout) > 0;
}

function ensureArchiveTag(refName, refSha) {
  const tag = `archive/${repoSlug()}/${sanitizeTagPart(refName)}/${todayStamp()}`;
  const exists = runAllowFail(`git show-ref --verify --quiet refs/tags/${tag}`).code === 0;
  if (!exists) {
    run(`git tag -a ${tag} ${refSha} -m "archive ${refName}"`);
  }
  return tag;
}

function cleanupBranches() {
  if (!hasArg("--stale")) {
    fail("Usage: npm run branch:cleanup -- --stale [--grace-days 7] [--apply]");
  }

  const policy = loadPolicy();
  const graceDays = Number(parseArg("--grace-days") || policy.grace_days || 7);
  const apply = hasArg("--apply");

  run("git fetch origin --prune");

  const current = run("git rev-parse --abbrev-ref HEAD");
  const localRefs = parseRefRows("refs/heads");
  const remoteRefs = parseRefRows("refs/remotes/origin").filter(
    (ref) => ref.name !== "origin/HEAD" && ref.name !== "origin"
  );

  const staleLocal = localRefs.filter((ref) => {
    if (ref.name === current) return false;
    if (ref.name === policy.active_feature_branch) return false;
    if (isLongLivedBranch(ref.name, policy)) return false;
    if (isQuarantineBranch(ref.name, policy)) return false;
    if (hasOpenPrForBranch(ref.name)) return false;
    return daysAgo(ref.unix) >= graceDays;
  });

  const staleRemote = remoteRefs
    .map((ref) => ({ ...ref, branch: ref.name.replace(/^origin\//, "") }))
    .filter((ref) => {
      if (!ref.branch) return false;
      if (ref.branch === "origin") return false;
      if (ref.branch === policy.active_feature_branch) return false;
      if (isLongLivedBranch(ref.branch, policy)) return false;
      if (isQuarantineBranch(ref.branch, policy)) return false;
      if (daysAgo(ref.unix) < graceDays) return false;
      if (hasOpenPrForBranch(ref.branch)) return false;
      return true;
    });

  if (staleLocal.length === 0 && staleRemote.length === 0) {
    console.log("No stale branches found.");
    return;
  }

  console.log(`Stale local branches (>= ${graceDays}d):`);
  for (const ref of staleLocal) {
    console.log(`- ${ref.name}`);
  }

  console.log(`\nStale remote branches (>= ${graceDays}d, no open PR):`);
  for (const ref of staleRemote) {
    console.log(`- ${ref.branch}`);
  }

  const archiveTags = new Set();
  for (const ref of staleLocal) {
    archiveTags.add(ensureArchiveTag(ref.name, ref.sha));
  }
  for (const ref of staleRemote) {
    archiveTags.add(ensureArchiveTag(ref.branch, ref.sha));
  }

  console.log("\nArchive tags created/kept:");
  for (const tag of archiveTags) {
    console.log(`- ${tag}`);
  }

  if (!apply) {
    console.log("\nDry run complete. Re-run with --apply to delete stale branches.");
    return;
  }

  for (const ref of staleLocal) {
    run(`git branch -D ${ref.name}`, { stdio: "inherit" });
  }

  for (const ref of staleRemote) {
    run(`git -c core.hooksPath=/dev/null push origin --delete ${ref.branch}`, {
      stdio: "inherit",
    });
  }

  console.log("\nStale branch cleanup complete.");
}

switch (command) {
  case "activate":
    activateBranch();
    break;
  case "handoff":
    handoffBranch();
    break;
  case "cleanup":
    cleanupBranches();
    break;
  default:
    console.log("Usage:");
    console.log("  npm run branch:activate -- <branch> --owner codex|antigravity");
    console.log("  npm run branch:handoff -- --to codex|antigravity [--note \"message\"]");
    console.log("  npm run branch:cleanup -- --stale [--grace-days 7] [--apply]");
    process.exit(command ? 1 : 0);
}
