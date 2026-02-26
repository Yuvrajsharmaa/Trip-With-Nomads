/* scripts/get_framer_collections.mjs */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { EventSource } from "eventsource";

global.EventSource = EventSource;

const MCP_URL = "https://mcp.unframer.co/sse?id=73506ef3a425ea9adf787e19fc7caddc64fe18181bcc24132d988e0397845253&secret=RPs6iEkPhdSWx5ek9fM4FoVAogTQ9izt";

async function run() {
    const transport = new SSEClientTransport(new URL(MCP_URL));
    const client = new Client({ name: "sync-client", version: "1.0.0" }, { capabilities: {} });

    try {
        await client.connect(transport);
        const result = await client.callTool({
            name: "getCMSCollections",
            arguments: {}
        });
        console.log(JSON.stringify(result, null, 2));
    } catch (error) {
        console.error("Error:", error);
    } finally {
        await client.close();
    }
}

run();
