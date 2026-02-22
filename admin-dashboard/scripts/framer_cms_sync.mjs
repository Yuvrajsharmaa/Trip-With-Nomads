/* scripts/framer_cms_sync.mjs */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { EventSource } from "eventsource";

global.EventSource = EventSource;

const MCP_URL = "https://mcp.unframer.co/sse?id=73506ef3a425ea9adf787e19fc7caddc64fe18181bcc24132d988e0397845253&secret=lxsqy1Gm5ZSDmnDuqflUOUhthJg00lBZ";

async function run() {
    const transport = new SSEClientTransport(new URL(MCP_URL));
    const client = new Client({ name: "sync-client", version: "1.0.0" }, { capabilities: {} });

    try {
        console.log("Connecting...");
        await client.connect(transport);

        console.log("Fetching Collections...");
        const result = await client.callTool({
            name: "getCMSCollections",
            arguments: {}
        });

        // const collections = result.content[0].text ? JSON.parse(result.content[0].text) : result.content;
        console.log("Result (Raw):", JSON.stringify(result, null, 2));

    } catch (error) {
        console.error("Error:", error);
    } finally {
        await client.close();
    }
}

run();
