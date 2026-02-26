/* scripts/match_trips.mjs */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { EventSource } from "eventsource";
import fs from 'fs';
import path from 'path';

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
            arguments: {
                collectionId: COLLECTION_ID,
                limit: 200
            }
        });

        const items = result.content[0].text ? JSON.parse(result.content[0].text).items : result.content.items;
        const localFiles = fs.readdirSync(THUMBNAIL_DIR).filter(f => !f.startsWith('.'));

        console.log("Matching results:");
        console.log("-----------------");

        const matches = [];
        const unmatchedFiles = [];

        for (const file of localFiles) {
            const fileName = file.toLowerCase();
            let found = false;

            for (const item of items) {
                const title = item.fieldData.edpZYc3f0.value.toLowerCase();
                const slug = item.slug.toLowerCase();

                // Simple matching logic
                const fileBase = fileName.split('-web')[0].replace(/[-_]/g, ' ');

                // Check if title contains key parts of filename or vice versa
                const titleParts = title.split(' ');
                const fileParts = fileBase.split(' ');

                // Heuristics
                const matchScore = fileParts.filter(p => p.length > 2 && title.includes(p)).length;

                // Specific manual overrides/better heuristics
                if (fileName.includes("umlingla") && (title.includes("umling la") || title.includes("hanle"))) {
                    matches.push({ file, trip: item.fieldData.edpZYc3f0.value, itemId: item.id });
                    found = true;
                    break;
                }

                if (fileName.includes("turtuk") && title.includes("turtuk")) {
                    matches.push({ file, trip: item.fieldData.edpZYc3f0.value, itemId: item.id });
                    found = true;
                    break;
                }

                if (matchScore >= 2 || (matchScore >= 1 && fileParts.some(p => title === p))) {
                    matches.push({ file, trip: item.fieldData.edpZYc3f0.value, itemId: item.id });
                    found = true;
                    break;
                }
            }

            if (!found) {
                unmatchedFiles.push(file);
            }
        }

        console.log("\nMatches Found:");
        matches.forEach(m => console.log(`✅ ${m.file}  <-->  ${m.trip}`));

        console.log("\nNo Match Found (will be dropped):");
        unmatchedFiles.forEach(f => console.log(`❌ ${f}`));

        console.log(`\nTotal Matches: ${matches.length}`);
        console.log(`Total Dropped: ${unmatchedFiles.length}`);

    } catch (error) {
        console.error("Error:", error);
    } finally {
        await client.close();
    }
}

run();
