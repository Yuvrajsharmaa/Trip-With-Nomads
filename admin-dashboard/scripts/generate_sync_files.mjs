/* scripts/generate_sync_files.mjs */
import fs from 'fs';

const rawFramerData = fs.readFileSync('framer_items.json', 'utf8');
const jsonStartIndex = rawFramerData.indexOf('{');
const framerData = JSON.parse(rawFramerData.substring(jsonStartIndex));
// Handle wrapped structure if present
const framerItems = framerData.items || (framerData.content ? JSON.parse(framerData.content).items : []);

const supabaseTrips = JSON.parse(fs.readFileSync('supabase_trips.json', 'utf8'));

console.log(`Loaded ${framerItems.length} Framer Items and ${supabaseTrips.length} Supabase Trips.`);

// Prepare Outputs
let supabaseUpdateScript = `/* sync_supabase_slugs.mjs */
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    console.log("Starting Supabase Slug Updates...");
`;

let jsOutput = `/* sync_framer_ids.mjs */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { EventSource } from "eventsource";
global.EventSource = EventSource;

const MCP_URL = "https://mcp.unframer.co/sse?id=73506ef3a425ea9adf787e19fc7caddc64fe18181bcc24132d988e0397845253&secret=lxsqy1Gm5ZSDmnDuqflUOUhthJg00lBZ";
const COLLECTION_ID = "Z1Bphf6oI";

async function run() {
    const transport = new SSEClientTransport(new URL(MCP_URL));
    const client = new Client({ name: "sync-client", version: "1.0.0" }, { capabilities: {} });
    await client.connect(transport);
    
    try {
`;

function normalize(str) {
    return str.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
}

const MANUAL_MAPPING = {
    "Winter Spiti Expedition": "Winter spiti",
    "Kedarnath Yatra": "Kedarnath 3N",
    "Do Dhaam": "Kedarnath With Badrinath 4N",
    "Bali with Nusa & Gili T": "Bali with Gili T.",
    "Thailand Songkran Festival": "Thailand  Songkaran",
    "Thailand full moon party": "Thailand Full Moon",
    "Spiti Valley with sangla holi": "Spiti With Sangla 6N 7D",
    "Sangla Holi Special": "Sangla Holi 3N 4D",
    "Baku with Shahdag": "Baku",
    "Baku without Shahdag": "Baku",
    "Vietnam": "Veitnam",
    "Teen taal": "Teen Taal 3N",
    "The Great Kashmir": "Kashmir"
};

let matchedCount = 0;

framerItems.forEach(fItem => {
    // Extract Title from Field 'edpZYc3f0' (Title)
    const fTitle = fItem.fieldData?.edpZYc3f0?.value || "";
    const fSlug = fItem.slug;
    const fTripId = fItem.fieldData?.sOpVBzQ8v?.value; // Current value in Framer

    // Find Supabase Match
    let sMatch = supabaseTrips.find(sItem => normalize(sItem.title) === normalize(fTitle));

    // Try Manual Mapping
    if (!sMatch && MANUAL_MAPPING[fTitle]) {
        const mappedTitle = MANUAL_MAPPING[fTitle];
        sMatch = supabaseTrips.find(sItem => normalize(sItem.title) === normalize(mappedTitle));
    }

    if (sMatch) {
        matchedCount++;
        // 1. Supabase Update (Only if different)
        if (sMatch.slug !== fSlug) {
            supabaseUpdateScript += `
    console.log("Updating ${sMatch.title} slug to ${fSlug}...");
    const { error: err${matchedCount} } = await supabase.from('trips').update({ slug: '${fSlug}' }).eq('id', '${sMatch.id}');
    if (err${matchedCount}) console.error("Error updating ${fSlug}:", err${matchedCount});
            `;
        }

        // 2. Framer Update (Update Framer with Supabase UUID)
        // Check if update needed (or force update to be safe)
        if (fTripId !== sMatch.id) {
            jsOutput += `
        console.log("Updating Framer ID for ${fSlug}...");
        await client.callTool({
            name: "upsertCMSItem",
            arguments: {
                collectionId: COLLECTION_ID,
                itemId: "${fItem.id}",
                fieldData: {
                    sOpVBzQ8v: { type: "string", value: "${sMatch.id}" }
                }
            }
        });
            `;
        }
    } else {
        console.warn(`No Supabase match for Framer Item: "${fTitle}"`);
    }
});

supabaseUpdateScript += `
    console.log("Supabase Updates Complete.");
}
run();
`;

jsOutput += `
    } catch (e) { console.error(e); }
    finally { await client.close(); }
}
run();
`;

console.log(`Matched ${matchedCount} items.`);

fs.writeFileSync('scripts/sync_supabase_slugs.mjs', supabaseUpdateScript);
fs.writeFileSync('scripts/sync_framer_ids.mjs', jsOutput);
