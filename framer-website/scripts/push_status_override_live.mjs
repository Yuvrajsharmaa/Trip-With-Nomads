import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { EventSource } from "eventsource";
import { readFileSync } from "fs";

global.EventSource = EventSource;

const MCP_URL = "https://mcp.unframer.co/sse?id=73506ef3a425ea9adf787e19fc7caddc64fe18181bcc24132d988e0397845253&secret=lxsqy1Gm5ZSDmnDuqflUOUhthJg00lBZ";
const TARGET_ID = "jvQtnDE";
const LOCAL_FILE = "/Users/yuvrajsharma/Desktop/Trip-With-Nomads/framer-website/framer/BookingStatusOverride.tsx";

const client = new Client({ name: "status-pusher", version: "1.0.2" }, { capabilities: {} });
const transport = new SSEClientTransport(new URL(MCP_URL));

function text(result) {
  return result?.content?.find((c) => c.type === "text")?.text || "";
}

function readContentPayload(result) {
  const raw = text(result);
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.content === "string") {
      return {
        raw,
        content: parsed.content,
        exports: Array.isArray(parsed.exports) ? parsed.exports : [],
      };
    }
  } catch {}
  return { raw, content: raw, exports: [] };
}

try {
  await client.connect(transport);
  const local = readFileSync(LOCAL_FILE, "utf8");

  const before = await client.callTool({ name: "readCodeFile", arguments: { codeFileId: TARGET_ID } });
  const beforePayload = readContentPayload(before);
  console.log(`Remote before length: ${beforePayload.content.length}`);

  const update = await client.callTool({
    name: "updateCodeFile",
    arguments: { codeFileId: TARGET_ID, content: local },
  });
  console.log(`Update response: ${text(update) || JSON.stringify(update)}`);

  const after = await client.callTool({ name: "readCodeFile", arguments: { codeFileId: TARGET_ID } });
  const afterPayload = readContentPayload(after);
  console.log(`Remote after length: ${afterPayload.content.length}`);
  console.log(`Local length: ${local.length}`);
  console.log(`Match: ${afterPayload.content === local}`);
  console.log(
    `Exports: ${afterPayload.exports.map((item) => item?.name).filter(Boolean).sort().join(", ")}`
  );
} catch (e) {
  console.error(e?.message || e);
  if (e?.data) console.error(JSON.stringify(e.data));
  process.exitCode = 1;
} finally {
  await client.close();
}
