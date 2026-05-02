#!/usr/bin/env node

import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const REPORT_DIR = resolve(process.cwd(), "docs/security");
const REPORT_PATH = resolve(REPORT_DIR, "secret-audit-report.md");

const PATTERNS = [
  {
    name: "JWT literal",
    jsRegex: /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/g,
    grepRegex: "eyJ[A-Za-z0-9_-]{20,}\\.[A-Za-z0-9_-]{20,}\\.[A-Za-z0-9_-]{20,}",
  },
  {
    name: "SUPABASE_SERVICE_ROLE_KEY literal",
    jsRegex: /SUPABASE_SERVICE_ROLE_KEY\s*[:=]\s*['\"][^'\"\n]{20,}['\"]/g,
    grepRegex: "SUPABASE_SERVICE_ROLE_KEY[[:space:]]*[:=][[:space:]]*['\"][^'\"\\n]{20,}['\"]",
  },
  {
    name: "OpenAI key",
    jsRegex: /sk-[A-Za-z0-9]{20,}/g,
    grepRegex: "sk-[A-Za-z0-9]{20,}",
  },
  {
    name: "GitHub PAT",
    jsRegex: /(ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})/g,
    grepRegex: "(ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})",
  },
  {
    name: "AWS Access Key",
    jsRegex: /AKIA[0-9A-Z]{16}/g,
    grepRegex: "AKIA[0-9A-Z]{16}",
  },
  {
    name: "Slack token",
    jsRegex: /xox[baprs]-[A-Za-z0-9-]{20,}/g,
    grepRegex: "xox[baprs]-[A-Za-z0-9-]{20,}",
  },
];

function run(cmd) {
  return execSync(cmd, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
}

function runAllowFail(cmd) {
  try {
    return run(cmd);
  } catch {
    return "";
  }
}

function scanCurrentTree() {
  const findings = [];
  const tracked = runAllowFail("git ls-files");
  const files = tracked ? tracked.split("\n").filter(Boolean) : [];

  for (const file of files) {
    if (file.startsWith(".next/") || file.startsWith(".open-next/") || file.includes("/node_modules/")) {
      continue;
    }

    const content = runAllowFail(`git show HEAD:${file}`);
    if (!content) continue;

    for (const pattern of PATTERNS) {
      const matches = content.match(pattern.jsRegex);
      if (!matches || matches.length === 0) continue;
      findings.push(`${file} (${pattern.name})`);
    }
  }

  return [...new Set(findings)].slice(0, 80);
}

function scanHistory() {
  const revisionsRaw = runAllowFail("git rev-list --all");
  const revisions = revisionsRaw ? revisionsRaw.split("\n").filter(Boolean) : [];
  const findings = [];

  for (const pattern of PATTERNS) {
    const patternHits = [];

    for (const rev of revisions) {
      if (patternHits.length >= 80) break;
      const out = runAllowFail(`git grep -nI -E \"${pattern.grepRegex}\" ${rev} --`);
      if (!out) continue;
      const lines = out.split("\n").filter(Boolean).slice(0, 5);
      for (const line of lines) {
        patternHits.push(`${rev}:${line}`);
        if (patternHits.length >= 80) break;
      }
    }

    if (patternHits.length > 0) {
      findings.push({ pattern: pattern.name, matches: patternHits });
    }
  }

  return findings;
}

const now = new Date();
const currentFindings = scanCurrentTree();
const historyFindings = scanHistory();

mkdirSync(REPORT_DIR, { recursive: true });

const lines = [];
lines.push("# Secret Audit Report");
lines.push("");
lines.push(`Generated: ${now.toISOString()}`);
lines.push("");
lines.push("## Scope");
lines.push("- Current tracked files");
lines.push("- Full git history (`git rev-list --all`) with commit-level grep");
lines.push("");
lines.push("## Current Tree Findings");
if (currentFindings.length === 0) {
  lines.push("- No high-risk secret patterns found in tracked files.");
} else {
  lines.push(`- Found ${currentFindings.length} potential matches:`);
  for (const finding of currentFindings) {
    lines.push(`  - ${finding}`);
  }
}
lines.push("");
lines.push("## History Findings");
if (historyFindings.length === 0) {
  lines.push("- No high-risk secret patterns found across history scan patterns.");
} else {
  for (const finding of historyFindings) {
    lines.push(`- ${finding.pattern}: ${finding.matches.length} sample matches`);
    for (const match of finding.matches) {
      lines.push(`  - ${match}`);
    }
  }
}
lines.push("");
lines.push("## Remediation Guidance");
lines.push("1. Keep runtime secrets in environment variables only.");
lines.push("2. Rotate any key that appears in current tree or history and revoke legacy credentials.");
lines.push("3. Keep `npm run secret:scan` and CI checks mandatory before merge.");

writeFileSync(REPORT_PATH, `${lines.join("\n")}\n`, "utf8");
console.log(`Wrote ${REPORT_PATH}`);

if (currentFindings.length > 0) {
  process.exit(1);
}
