
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { EventSource } from "eventsource";
global.EventSource = EventSource;

const MCP_URL = "https://mcp.unframer.co/sse?id=73506ef3a425ea9adf787e19fc7caddc64fe18181bcc24132d988e0397845253&secret=lxsqy1Gm5ZSDmnDuqflUOUhthJg00lBZ";

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
