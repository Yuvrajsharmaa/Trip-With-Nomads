import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { EventSource } from "eventsource";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

global.EventSource = EventSource;

const MCP_URL =
  "https://mcp.unframer.co/sse?id=73506ef3a425ea9adf787e19fc7caddc64fe18181bcc24132d988e0397845253&secret=lxsqy1Gm5ZSDmnDuqflUOUhthJg00lBZ";
const TARGET_ID = "jvQtnDE";
const BACKUP_DIR = "/Users/yuvrajsharma/Desktop/Trip-With-Nomads/framer-website/.framer_backups";

function getText(result) {
  return result?.content?.find((item) => item.type === "text")?.text || "";
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function main() {
  const client = new Client({ name: "status-backer", version: "1.0.0" }, { capabilities: {} });
  const transport = new SSEClientTransport(new URL(MCP_URL));

  try {
    await client.connect(transport);
    const read = await client.callTool({
      name: "readCodeFile",
      arguments: { codeFileId: TARGET_ID },
    });
    const content = getText(read);
    if (!content) {
      throw new Error("Empty response from readCodeFile");
    }
    mkdirSync(BACKUP_DIR, { recursive: true });
    const file = join(BACKUP_DIR, `BookingStatusOverride.${TARGET_ID}.${stamp()}.tsx`);
    writeFileSync(file, content, "utf8");
    console.log(`Backup written: ${file}`);
    console.log(`Length: ${content.length}`);
  } catch (err) {
    console.error(err?.message || err);
    if (err?.data) console.error(JSON.stringify(err.data));
    process.exitCode = 1;
  } finally {
    await client.close();
  }
}

main();
