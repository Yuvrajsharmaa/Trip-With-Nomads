/* scripts/execute_sync.mjs */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { EventSource } from "eventsource";
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';
import path from 'path';

// Load ENV for Supabase if dotenv works, else we hardcode API fetch or rely on Supabase SDK which works without dotenv if env passed
// Let's use the MCP tool for Supabase execute_sql to be safe, or just insert.
// Wait, the agent has the `execute_sql` tool for supabase. I can do it via the script using node fetch or use the agent tool. 
// I'll output the SQL script for Supabase so the agent can execute it.
// And I will execute the Framer MCP syncs here.

global.EventSource = EventSource;

const MCP_URL = "https://mcp.unframer.co/sse?id=73506ef3a425ea9adf787e19fc7caddc64fe18181bcc24132d988e0397845253&secret=RPs6iEkPhdSWx5ek9fM4FoVAogTQ9izt";
const COLLECTION_ID = "Z1Bphf6oI";

async function run() {
    const syncPlan = JSON.parse(fs.readFileSync('sync_plan.json', 'utf8'));

    // 1. Generate SQL for Supabase Insert
    let sql = `-- Supabase Inserts\n`;
    for (const trip of syncPlan.supabase_inserts) {
        sql += `INSERT INTO public.trips (id, title, slug) VALUES ('${trip.id}', '${trip.title.replace(/'/g, "''")}', '${trip.slug}');\n`;
    }
    fs.writeFileSync('sync_supabase.sql', sql);
    console.log("SQL generated: sync_supabase.sql");

    // 2. Framer CMS Syncs
    const transport = new SSEClientTransport(new URL(MCP_URL));
    const client = new Client({ name: "execute-client", version: "1.0.0" }, { capabilities: {} });

    try {
        await client.connect(transport);

        // Fetch current items to get their item IDs for updating `trip_id`
        const getItemsRes = await client.callTool({
            name: "getCMSItems",
            arguments: { collectionId: COLLECTION_ID, limit: 100 }
        });
        const items = getItemsRes.content[0].text ? JSON.parse(getItemsRes.content[0].text).items : getItemsRes.content.items;

        console.log(`\n--- Framer: Syncing Existing Items ---`);
        for (const syncItem of syncPlan.framer_sync_ids) {
            const framerRow = items.find(i => i.fieldData.edpZYc3f0?.value === syncItem.title);
            if (framerRow) {
                console.log(`Updating ${syncItem.title} (${framerRow.id}) with trip_id: ${syncItem.supabase_id}`);
                await client.callTool({
                    name: "upsertCMSItem",
                    arguments: {
                        collectionId: COLLECTION_ID,
                        itemId: framerRow.id,
                        fieldData: {
                            sOpVBzQ8v: { type: "string", value: syncItem.supabase_id }
                        }
                    }
                });
            } else {
                console.log(`⚠️ Warning: Could not find framer item for ${syncItem.title}`);
            }
        }

        console.log(`\n--- Framer: Creating Draft Items ---`);
        for (const draft of syncPlan.framer_drafts) {
            console.log(`Creating Draft: ${draft.title}`);
            await client.callTool({
                name: "upsertCMSItem",
                arguments: {
                    collectionId: COLLECTION_ID,
                    slug: draft.slug,
                    draft: true,
                    fieldData: {
                        edpZYc3f0: { type: "string", value: draft.title }, // title
                        sOpVBzQ8v: { type: "string", value: draft.trip_id }, // trip_id
                        LUnTv710m: { type: "string", value: "TBD" }, // No. of Days
                        fhY5p3Uv0: { type: "string", value: "TBD" }, // No. of Nights
                        jCUvfD0Og: { type: "string", value: "TBD" }, // Pickup & Drop
                        bcIz1zCfP: { type: "formattedText", value: "<p>TBD</p>" }, // Trip overview
                        ehDqi1QjF: { type: "formattedText", value: "<p>TBD</p>" }  // Inclusions & Exclusions
                    }
                }
            });
        }

        console.log("\nFramer Updates Completed.");

    } catch (error) {
        console.error("Framer Sync Error:", error);
    } finally {
        await client.close();
    }
}

run();
