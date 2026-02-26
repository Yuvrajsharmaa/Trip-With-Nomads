import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { EventSource } from "eventsource";

global.EventSource = EventSource;

const MCP_URL = "https://mcp.unframer.co/sse?id=73506ef3a425ea9adf787e19fc7caddc64fe18181bcc24132d988e0397845253&secret=RPs6iEkPhdSWx5ek9fM4FoVAogTQ9izt";
const COLLECTION_ID = "Z1Bphf6oI";

async function run() {
    const transport = new SSEClientTransport(new URL(MCP_URL));
    const client = new Client({ name: "verify-client", version: "1.0.0" }, { capabilities: {} });
    try {
        await client.connect(transport);
        const result = await client.callTool({
            name: "getCMSItems",
            arguments: { collectionId: COLLECTION_ID, limit: 100 }
        });
        const content = result.content[0].text ? JSON.parse(result.content[0].text) : result.content;

        console.log(`\nFound ${content.items.length} items total in Framer CMS`);
        console.log("-----------------------------------------");

        content.items.forEach(item => {
            console.log(`[${item.status || "PUBLISHED"}] ${item.fieldData.edpZYc3f0.value}`);
        });

    } catch (error) {
        console.error("Framer Error:", error);
    } finally {
        await client.close();
    }
}
run();
