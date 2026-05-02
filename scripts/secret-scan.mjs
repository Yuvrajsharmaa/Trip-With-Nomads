#!/usr/bin/env node

import { execSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const mode = process.argv[2] || "ci";

const IGNORE_PREFIXES = [
  ".next/",
  ".open-next/",
  "node_modules/",
  ".wrangler/",
  "coverage/",
  "dist/",
  "build/",
  "framer-website/.next/",
  "framer-website/.open-next/",
  "framer-website/.wrangler/",
  "framer-website/.tmp/",
  ".recovery-crm-",
  "docs/security/secret-audit-report.md",
];

const ALLOWLIST_FILE = ".secret-scan-allowlist";
const allowedPatterns = existsSync(ALLOWLIST_FILE)
  ? readFileSync(ALLOWLIST_FILE, "utf8")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
  : [];

const RULES = [
  {
    name: "JWT literal",
    regex: /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/g,
  },
  {
    name: "Supabase service role assignment",
    regex: /SUPABASE_SERVICE_ROLE_KEY\s*[:=]\s*["'][^"'\n]{20,}["']/g,
  },
  {
    name: "OpenAI API key",
    regex: /sk-[A-Za-z0-9]{20,}/g,
  },
  {
    name: "GitHub PAT",
    regex: /(ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})/g,
  },
  {
    name: "AWS Access Key",
    regex: /AKIA[0-9A-Z]{16}/g,
  },
  {
    name: "Slack token",
    regex: /xox[baprs]-[A-Za-z0-9-]{20,}/g,
  },
  {
    name: "Unframer MCP URL with secret",
    regex: /https:\/\/mcp\.unframer\.co\/sse\?[^"'\s]*secret=[^"'\s]+/gi,
  },
  {
    name: "Committed env file",
    regex: /(^|\/)\.env(\.|$)/g,
    pathOnly: true,
  },
];

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

function runBuffer(cmd) {
  return execSync(cmd, { encoding: "buffer" });
}

function parseNulList(buffer) {
  return buffer
    .toString("utf8")
    .split("\u0000")
    .map((line) => line.trim())
    .filter(Boolean);
}

function shouldIgnorePath(path) {
  return IGNORE_PREFIXES.some((prefix) => path.startsWith(prefix));
}

function isAllowlisted(path, text) {
  const combined = `${path}\n${text}`;
  return allowedPatterns.some((pattern) => combined.includes(pattern));
}

function likelyPlaceholder(text) {
  const lower = text.toLowerCase();
  return (
    lower.includes("example") ||
    lower.includes("placeholder") ||
    lower.includes("redacted") ||
    lower.includes("process.env") ||
    lower.includes("next_public")
  );
}

function getPathsForMode() {
  if (mode === "pre-commit") {
    return parseNulList(runBuffer("git diff --cached --name-only --diff-filter=ACMR -z"));
  }
  if (mode === "pre-push") {
    const upstream = runAllowFail("git rev-parse --abbrev-ref --symbolic-full-name @{u}") || "origin/main";
    return parseNulList(runBuffer(`git diff --name-only --diff-filter=ACMR ${upstream}...HEAD -z`));
  }
  return parseNulList(runBuffer("git ls-files -z"));
}

function scanFiles(paths) {
  const findings = [];

  for (const path of paths) {
    if (shouldIgnorePath(path)) continue;
    const pathText = path.replaceAll("\\", "/");

    for (const rule of RULES) {
      if (rule.pathOnly) {
        if (rule.regex.test(pathText) && !isAllowlisted(pathText, "")) {
          findings.push({ rule: rule.name, path: pathText, sample: pathText });
        }
        rule.regex.lastIndex = 0;
        continue;
      }

      if (!existsSync(pathText)) continue;
      let content = "";
      try {
        content = readFileSync(pathText, "utf8");
      } catch {
        continue;
      }

      const matches = [...content.matchAll(rule.regex)];
      rule.regex.lastIndex = 0;
      if (matches.length === 0) continue;

      for (const match of matches) {
        const sample = match[0].slice(0, 120);
        if (likelyPlaceholder(sample)) continue;
        if (isAllowlisted(pathText, sample)) continue;
        findings.push({ rule: rule.name, path: pathText, sample });
      }
    }
  }

  return findings;
}

function main() {
  if (!["pre-commit", "pre-push", "ci"].includes(mode)) {
    console.error(`Unknown mode: ${mode}`);
    process.exit(2);
  }

  const paths = getPathsForMode();
  const findings = scanFiles(paths);

  if (findings.length > 0) {
    console.error(`secret-scan failed (${mode}).`);
    for (const finding of findings) {
      console.error(`- [${finding.rule}] ${finding.path}`);
    }
    process.exit(1);
  }

  console.log(`secret-scan passed (${mode}).`);
}

main();
