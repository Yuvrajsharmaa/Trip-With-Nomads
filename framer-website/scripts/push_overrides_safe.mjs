import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { EventSource } from "eventsource";
import { resolveMcpUrl } from "./_mcp_env.mjs";

global.EventSource = EventSource;

const MCP_URL = resolveMcpUrl();
const DRY_RUN = process.argv.includes("--dry-run");
const ALLOW_EXPORT_REMOVAL = process.argv.includes("--allow-export-removal");
const INCLUDE_EMAIL_OVERRIDE = process.argv.includes("--include-email");
const INCLUDE_BOOKING_OVERRIDE = process.argv.includes("--include-booking");
const ONLY_ARG = process.argv.find((arg) => arg.startsWith("--only=")) || "";
const ONLY_KEYS = new Set(
  String(ONLY_ARG.split("=")[1] || "")
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean)
);

const TARGETS = [
  {
    key: "checkout",
    label: "CheckoutPageOverrides",
    localFile: "/Users/yuvrajsharma/Desktop/Trip-With-Nomads/framer-website/framer/CheckoutPageOverrides.tsx",
    expectedIds: ["perCTUm"],
    acceptedNames: ["CheckoutPageOverrides.tsx"],
  },
  {
    key: "tripprice",
    label: "TripPriceOverrides",
    localFile: "/Users/yuvrajsharma/Desktop/Trip-With-Nomads/framer-website/framer/TripPriceOverrides.tsx",
    expectedIds: ["u_WTK4w"],
    acceptedNames: ["TripPriceOverrides.tsx"],
  },
  {
    key: "status",
    label: "BookingStatusOverride",
    localFile: "/Users/yuvrajsharma/Desktop/Trip-With-Nomads/framer-website/framer/BookingStatusOverride.tsx",
    expectedIds: ["jvQtnDE"],
    acceptedNames: ["BookingStatusOverride.tsx", "Bookingstatusoverride.tsx"],
  },
  {
    key: "booking",
    label: "BookingOverrides",
    localFile: "/Users/yuvrajsharma/Desktop/Trip-With-Nomads/framer-website/framer/BookingOverrides.tsx",
    expectedIds: [],
    acceptedNames: ["BookingOverrides.tsx"],
    optional: true,
    enabled: INCLUDE_BOOKING_OVERRIDE,
  },
  {
    key: "email",
    label: "EmailPopupOverride",
    localFile: "/Users/yuvrajsharma/Desktop/Trip-With-Nomads/framer-website/framer/EmailPopupOverride.tsx",
    expectedIds: ["EaMDfOP"],
    acceptedNames: ["EmailPopupOverride.tsx"],
    enabled: INCLUDE_EMAIL_OVERRIDE,
  },
];

const BACKUP_ROOT = resolve(
  "/Users/yuvrajsharma/Desktop/Trip-With-Nomads/framer-website/backups/framer-overrides"
);

function text(result) {
  return result?.content?.find((entry) => entry.type === "text")?.text || "";
}

function parseCodePayload(result) {
  const raw = text(result);
  try {
    const parsed = JSON.parse(raw);
    const content = typeof parsed?.content === "string" ? parsed.content : raw;
    const exportsList = Array.isArray(parsed?.exports)
      ? parsed.exports.map((item) => String(item?.name || "").trim()).filter(Boolean)
      : [];
    return { content, exportsList, raw };
  } catch {
    return { content: raw, exportsList: extractExportNames(raw), raw };
  }
}

function extractExportNames(code) {
  if (!code) return [];
  const patterns = [
    /export\s+function\s+([A-Za-z0-9_]+)/g,
    /export\s+const\s+([A-Za-z0-9_]+)/g,
    /export\s+class\s+([A-Za-z0-9_]+)/g,
    /export\s+\{\s*([^}]+)\s*\}/g,
  ];
  const names = new Set();
  for (const pattern of patterns) {
    let match = null;
    while ((match = pattern.exec(code)) !== null) {
      if (match[1]?.includes(",")) {
        for (const part of match[1].split(",")) {
          const symbol = part.trim().split(/\s+as\s+/i)[0]?.trim();
          if (symbol) names.add(symbol);
        }
      } else if (match[1]) {
        names.add(match[1].trim());
      }
    }
  }
  return [...names].sort();
}

function resolveTargetItem(target, items) {
  const byExpectedId = items.find((item) => target.expectedIds.includes(String(item?.id || "")));
  if (byExpectedId) return byExpectedId;

  const accepted = new Set(target.acceptedNames.map((name) => name.toLowerCase()));
  const byName = items.filter((item) => accepted.has(String(item?.name || "").toLowerCase()));

  if (byName.length === 1) return byName[0];
  if (byName.length > 1) {
    throw new Error(
      `Multiple matches for ${target.label}: ${byName.map((item) => `${item.id}:${item.name}`).join(", ")}`
    );
  }

  if (target.optional) return null;
  throw new Error(
    `Missing target for ${target.label}. Expected IDs: ${target.expectedIds.join(", ") || "none"}, names: ${
      target.acceptedNames.join(", ")
    }`
  );
}

function parseCodeFileItemsFromProjectXml(xmlText) {
  const output = [];
  const pattern =
    /<(CodeOverride|CodeComponent)\s+[^>]*codeFileId="([^"]+)"[^>]*path="([^"]+)"[^>]*\/>/g;
  let match = null;
  while ((match = pattern.exec(xmlText)) !== null) {
    const path = String(match[3] || "").trim();
    output.push({
      id: String(match[2] || "").trim(),
      name: path.split("/").pop() || path,
      path,
      type: match[1],
    });
  }
  return output;
}

async function loadCodeFiles(client) {
  const result = await client.callTool({ name: "getProjectXml", arguments: {} });
  const raw = text(result);
  const items = parseCodeFileItemsFromProjectXml(raw);
  if (!items.length) {
    throw new Error("No code files could be parsed from getProjectXml.");
  }
  return items;
}

function ensureExportParity(remoteExports, localExports, targetLabel) {
  const remote = new Set(remoteExports);
  const local = new Set(localExports);
  const missing = [...remote].filter((name) => !local.has(name));
  if (!missing.length) return;
  if (ALLOW_EXPORT_REMOVAL) {
    console.warn(`[WARN] ${targetLabel}: local file removes exports: ${missing.join(", ")}`);
    return;
  }
  throw new Error(
    `${targetLabel}: push blocked because local file is missing remote exports (${missing.join(
      ", "
    )}). Re-run with --allow-export-removal if intentional.`
  );
}

function backupRemote(targetItem, payload) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = resolve(BACKUP_ROOT, timestamp);
  mkdirSync(dir, { recursive: true });
  const name = `${targetItem.id}__${basename(targetItem.name || "code.tsx")}`;
  const filePath = resolve(dir, name);
  writeFileSync(filePath, payload.content, "utf8");
  return filePath;
}

async function pushTarget(client, target, targetItem) {
  const local = readFileSync(target.localFile, "utf8");

  const beforeResult = await client.callTool({ name: "readCodeFile", arguments: { codeFileId: targetItem.id } });
  const before = parseCodePayload(beforeResult);
  const remoteExports = before.exportsList.length ? before.exportsList : extractExportNames(before.content);
  const localExports = extractExportNames(local);

  ensureExportParity(remoteExports, localExports, target.label);

  const backupPath = backupRemote(targetItem, before);
  console.log(`[SAFE] ${target.label}: mapped to ${targetItem.id} (${targetItem.name}), backup=${backupPath}`);
  console.log(`[SAFE] ${target.label}: remote exports=${remoteExports.join(", ") || "(none)"}`);
  console.log(`[SAFE] ${target.label}: local exports=${localExports.join(", ") || "(none)"}`);

  if (before.content === local) {
    console.log(`[SAFE] ${target.label}: no content change, skipping update.`);
    return;
  }

  if (DRY_RUN) {
    console.log(`[SAFE] ${target.label}: dry-run only, update skipped.`);
    return;
  }

  await client.callTool({ name: "updateCodeFile", arguments: { codeFileId: targetItem.id, content: local } });

  const afterResult = await client.callTool({ name: "readCodeFile", arguments: { codeFileId: targetItem.id } });
  const after = parseCodePayload(afterResult);
  if (after.content !== local) {
    throw new Error(`${target.label}: post-push readback mismatch for ${targetItem.id}`);
  }

  console.log(`[SAFE] ${target.label}: update OK and verified via readback.`);
}

async function main() {
  const client = new Client({ name: "safe-override-pusher", version: "1.0.0" }, { capabilities: {} });
  const transport = new SSEClientTransport(new URL(MCP_URL));

  try {
    await client.connect(transport);
    const items = await loadCodeFiles(client);

    for (const target of TARGETS) {
      if (ONLY_KEYS.size && !ONLY_KEYS.has(target.key)) {
        console.log(`[SAFE] ${target.label}: skipped (not in --only filter).`);
        continue;
      }
      if (target.enabled === false) {
        console.log(`[SAFE] ${target.label}: skipped (flag not enabled).`);
        continue;
      }
      const targetItem = resolveTargetItem(target, items);
      if (!targetItem) {
        console.log(`[SAFE] ${target.label}: not present in current Framer project, skipped.`);
        continue;
      }
      await pushTarget(client, target, targetItem);
    }

    console.log("[SAFE] Framer override safe push flow complete.");
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(error?.message || error);
  if (error?.stack) {
    console.error(error.stack.split("\n").slice(0, 12).join("\n"));
  }
  process.exitCode = 1;
});
