import { resolveMcpUrl } from "./_mcp_env.mjs";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { EventSource } from "eventsource";
global.EventSource = EventSource;

const MCP_URL = resolveMcpUrl();

async function main() {
    const transport = new SSEClientTransport(new URL(MCP_URL));
    const client = new Client({ name: "tool-lister", version: "1.0.0" }, { capabilities: {} });

    try {
        await client.connect(transport);
        const result = await client.listTools();
        console.log("Found " + result.tools.length + " tools:");
        result.tools.forEach(t => {
            console.log(`- ${t.name}: ${t.description.substring(0, 100)}...`);
        });

    } catch (e) {
        console.error("Error:", e);
    } finally {
        await client.close();
    }
}

main();
