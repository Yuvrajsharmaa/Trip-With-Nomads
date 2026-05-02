import { resolveMcpUrl } from "./_mcp_env.mjs";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { EventSource } from "eventsource";
global.EventSource = EventSource;

const MCP_URL = resolveMcpUrl();

async function main() {
    const transport = new SSEClientTransport(new URL(MCP_URL));
    const client = new Client({ name: "style-fetcher", version: "1.0.0" }, { capabilities: {} });

    try {
        await client.connect(transport);
        console.log("Connected to MCP");

        const tools = await client.listTools();
        console.log("Tools:", JSON.stringify(tools, null, 2));

        const resources = await client.listResources();
        console.log("Resources:", JSON.stringify(resources, null, 2));

    } catch (e) {
        console.error("Error:", e);
    } finally {
        await client.close();
    }
}

main();
