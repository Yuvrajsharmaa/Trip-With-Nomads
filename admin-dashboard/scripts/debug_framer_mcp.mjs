/* scripts/debug_framer_mcp.mjs */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { EventSource } from "eventsource";

global.EventSource = EventSource;

const MCP_URL = "https://mcp.unframer.co/sse?id=73506ef3a425ea9adf787e19fc7caddc64fe18181bcc24132d988e0397845253&secret=RPs6iEkPhdSWx5ek9fM4FoVAogTQ9izt";

async function run() {
    console.log("Connecting using:", MCP_URL);
    const transport = new SSEClientTransport(new URL(MCP_URL));
    const client = new Client({ name: "sync-client", version: "1.0.0" }, { capabilities: {} });

    try {
        await client.connect(transport);
        console.log("Connected.");
        const result = await client.callTool({
            name: "getCMSItems",
            arguments: {
                collectionId: "Z1Bphf6oI",
                limit: 5
            }
        });
        console.log("Raw result text:", result.content[0].text);
    } catch (error) {
        console.error("Connection/Tool Error:", error);
    } finally {
        await client.close();
    }
}

run();
