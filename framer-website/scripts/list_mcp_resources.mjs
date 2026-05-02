import { resolveMcpUrl } from "./_mcp_env.mjs";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { EventSource } from "eventsource";
global.EventSource = EventSource;

const MCP_URL = resolveMcpUrl();

async function main() {
    const transport = new SSEClientTransport(new URL(MCP_URL));
    const client = new Client({ name: "resource-lister", version: "1.0.0" }, { capabilities: {} });

    try {
        await client.connect(transport);

        // List all resources
        let cursor = undefined;
        let allResources = [];
        do {
            const result = await client.listResources({ cursor });
            allResources = allResources.concat(result.resources || []);
            cursor = result.nextCursor;
        } while (cursor);

        console.log(`Total resources: ${allResources.length}`);
        console.log(JSON.stringify(allResources, null, 2));

    } catch (e) {
        console.error("Fatal:", e.message);
    } finally {
        await client.close();
    }
}

main();
