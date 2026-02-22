/* scripts/fetch_framer_items.mjs */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { EventSource } from "eventsource";

global.EventSource = EventSource;

const MCP_URL = "https://mcp.unframer.co/sse?id=73506ef3a425ea9adf787e19fc7caddc64fe18181bcc24132d988e0397845253&secret=lxsqy1Gm5ZSDmnDuqflUOUhthJg00lBZ";
const COLLECTION_ID = "Z1Bphf6oI"; // Domestic Trips

async function run() {
    const transport = new SSEClientTransport(new URL(MCP_URL));
    const client = new Client({ name: "sync-client", version: "1.0.0" }, { capabilities: {} });

    try {
        await client.connect(transport);

        console.log(`Fetching Items from ${COLLECTION_ID}...`);
        const result = await client.callTool({
            name: "getCMSItems",
            arguments: {
                collectionId: COLLECTION_ID,
                limit: 100 // Fetch up to 100 trips
            }
        });

        // The content might be text or object, handling both
        const content = result.content[0].text ? result.content[0].text : JSON.stringify(result.content);
        console.log(content);

    } catch (error) {
        console.error("Error:", error);
    } finally {
        await client.close();
    }
}

run();
