import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { EventSource } from "eventsource";
import { writeFileSync } from "fs";
global.EventSource = EventSource;
const MCP_URL = "https://mcp.unframer.co/sse?id=73506ef3a425ea9adf787e19fc7caddc64fe18181bcc24132d988e0397845253&secret=lxsqy1Gm5ZSDmnDuqflUOUhthJg00lBZ";
const client = new Client({ name: "xml-dump", version: "1.0.0" }, { capabilities: {} });
const transport = new SSEClientTransport(new URL(MCP_URL));
try {
 await client.connect(transport);
 const r = await client.callTool({name:"getProjectXml",arguments:{}});
 const txt = r?.content?.find(c=>c.type==='text')?.text || '';
 writeFileSync('.tmp_project_xml.txt',txt);
 console.log('len',txt.length);
 console.log(txt.slice(0,1600));
} catch (e) {
 console.error(e?.message || e)
 if (e?.data) console.error(JSON.stringify(e.data));
} finally { await client.close(); }
