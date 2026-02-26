/* scripts/final_match_v2.mjs */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { EventSource } from "eventsource";
import fs from 'fs';

global.EventSource = EventSource;

const MCP_URL = "https://mcp.unframer.co/sse?id=73506ef3a425ea9adf787e19fc7caddc64fe18181bcc24132d988e0397845253&secret=RPs6iEkPhdSWx5ek9fM4FoVAogTQ9izt";
const COLLECTION_ID = "Z1Bphf6oI";
const THUMBNAIL_DIR = "/Users/yuvrajsharma/Downloads/Thumnail";

async function run() {
    const transport = new SSEClientTransport(new URL(MCP_URL));
    const client = new Client({ name: "sync-client", version: "1.0.0" }, { capabilities: {} });

    try {
        await client.connect(transport);
        const result = await client.callTool({
            name: "getCMSItems",
            arguments: { collectionId: COLLECTION_ID, limit: 100 }
        });

        const items = result.content[0].text ? JSON.parse(result.content[0].text).items : result.content.items;
        const localFiles = fs.readdirSync(THUMBNAIL_DIR).filter(f => !f.startsWith('.'));

        const matches = [];
        const dropped = [];

        for (const file of localFiles) {
            const fileName = file.toLowerCase();
            let foundItem = null;

            if (fileName.includes("umlingla")) {
                foundItem = items.find(i => i.fieldData.edpZYc3f0.value.toLowerCase().includes("umling la"));
            } else if (fileName.includes("turtuk")) {
                foundItem = items.find(i => i.fieldData.edpZYc3f0.value.toLowerCase().includes("turtuk"));
            } else if (fileName.includes("kedarnath")) {
                foundItem = items.find(i => i.fieldData.edpZYc3f0.value.toLowerCase().includes("kedarnath"));
            } else if (fileName.includes("apricot-blossom")) {
                foundItem = items.find(i => i.fieldData.edpZYc3f0.value.toLowerCase().includes("apricot blossom"));
            } else if (fileName.includes("teen-taal")) {
                // Might match 'Teen taal'
                foundItem = items.find(i => i.fieldData.edpZYc3f0.value.toLowerCase() === "teen taal");
            } else if (fileName.includes("winter-spiti")) {
                foundItem = items.find(i => i.fieldData.edpZYc3f0.value.toLowerCase().includes("winter spiti"));
            } else if (fileName.includes("spiti-biking")) {
                foundItem = items.find(i => i.fieldData.edpZYc3f0.value.toLowerCase().includes("summer spiti"));
            } else if (fileName.includes("chandrataal")) {
                foundItem = items.find(i => i.fieldData.edpZYc3f0.value.toLowerCase().includes("chandrataal") || i.fieldData.edpZYc3f0.value.toLowerCase().includes("spiti"));
            } else if (fileName.includes("zanskar")) {
                foundItem = items.find(i => i.fieldData.edpZYc3f0.value.toLowerCase().includes("zanskar"));
            }

            if (foundItem) {
                matches.push({ file, tripTitle: foundItem.fieldData.edpZYc3f0.value, itemId: foundItem.id });
            } else {
                dropped.push(file);
            }
        }

        console.log(JSON.stringify({ matches, dropped }, null, 2));

    } catch (error) {
        console.error(error);
    } finally {
        await client.close();
    }
}

run();
