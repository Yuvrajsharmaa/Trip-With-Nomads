import { readFileSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { EventSource } from "eventsource";

global.EventSource = EventSource;

const MCP_URL = process.argv[2];
const CODE_FILE_ID = process.argv[3];
const FILE_PATH = process.argv[4];

if (!MCP_URL || !CODE_FILE_ID || !FILE_PATH) {
  console.error("Usage: node push_code_file.mjs <mcp_url> <code_file_id> <file_path>");
  process.exit(1);
}

const content = readFileSync(FILE_PATH, "utf-8");
const transport = new SSEClientTransport(new URL(MCP_URL));
const client = new Client({ name: "code-pusher", version: "1.0.0" }, { capabilities: {} });

function pickText(result) {
  return (result?.content || []).map((c) => c?.text || "").join("\n");
}

try {
  await client.connect(transport);

  const updateRes = await client.callTool({
    name: "updateCodeFile",
    arguments: { codeFileId: CODE_FILE_ID, content },
  });

  const updateText = pickText(updateRes);
  console.log("UPDATE_RESULT_START");
  console.log(updateText.slice(0, 2000));
  console.log("UPDATE_RESULT_END");

  const readRes = await client.callTool({
    name: "readCodeFile",
    arguments: { codeFileId: CODE_FILE_ID },
  });

  const readText = pickText(readRes);
  console.log("READ_RESULT_START");
  console.log(readText.slice(0, 4000));
  console.log("READ_RESULT_END");
} catch (e) {
  console.error("PUSH_FAILED", e?.message || e);
  if (e?.data) console.error(JSON.stringify(e.data, null, 2));
  process.exit(2);
} finally {
  await client.close();
}
