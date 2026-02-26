import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { EventSource } from "eventsource";

global.EventSource = EventSource;
const MCP_URL = "https://mcp.unframer.co/sse?id=73506ef3a425ea9adf787e19fc7caddc64fe18181bcc24132d988e0397845253&secret=lxsqy1Gm5ZSDmnDuqflUOUhthJg00lBZ";

const transport = new SSEClientTransport(new URL(MCP_URL));
const client = new Client({ name: "project-xml", version: "1.0.0" }, { capabilities: {} });

try {
  await client.connect(transport);
  const r = await client.callTool({ name: "getProjectXml", arguments: {} });
  const text = r?.content?.map((c) => c.text || "").join("\n") || "";
  console.log(text);
} catch (e) {
  console.error(e?.message || e);
  if (e?.data) console.error(JSON.stringify(e.data, null, 2));
} finally {
  await client.close();
}
