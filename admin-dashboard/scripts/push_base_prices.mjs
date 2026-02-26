import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { EventSource } from "eventsource";
import fs from 'fs';

global.EventSource = EventSource;

const MCP_URL = "https://mcp.unframer.co/sse?id=73506ef3a425ea9adf787e19fc7caddc64fe18181bcc24132d988e0397845253&secret=lxsqy1Gm5ZSDmnDuqflUOUhthJg00lBZ";
const COLLECTION_ID = "Z1Bphf6oI";

const supabaseTrips = [
    { "id": "a1b86c67-45e9-4193-a645-ea1a74d0af09", "title": "Winter spiti", "slug": "winter-spiti-expedition" },
    { "id": "fae90e04-3c77-4878-9b6b-a5f1e7e37fa7", "title": "Thailand Full Moon", "slug": "thailand-full-moon-party" },
    { "id": "1d081900-96e7-491d-b30e-0f637476b40d", "title": "Baku without Shahdag", "slug": "baku-without-shahdag" },
    { "id": "1f80ad9b-ffe2-40c2-8f63-e9e228646ffc", "title": "Summer Spiti", "slug": "summer-spiti" },
    { "id": "67f214ed-0655-47d5-8aff-d2c485d3ad01", "title": "Spiti Biking", "slug": "spiti-biking" },
    { "id": "4cb2a09e-2838-4941-ad84-c66f9c414ff3", "title": "Teen Taal with Gopuranjan 4N", "slug": "teen-taal-with-gopuranjan-4n" },
    { "id": "59d33497-0929-47b1-be3a-7b4d8a363b0b", "title": "Manali With Chandrataal 2N", "slug": "manali-with-chandrataal-2n" },
    { "id": "56bd2126-f80e-45f3-9f09-588e3931f55b", "title": "Ladakh apricot blossom", "slug": "ladakh-apricot-blossom" },
    { "id": "f0e16792-b0f5-4c45-9dcd-609ac7e9e62a", "title": "Zanskar 6N", "slug": "zanskar-6n" },
    { "id": "a878285e-799f-41e2-9295-6fa4fa672c65", "title": "Leh to Leh with Turtuk 6N", "slug": "leh-to-leh-with-turtuk-6n" },
    { "id": "89b17e7f-1a26-4398-816f-32686cf7b2ae", "title": "Leh to Leh with Turtuk 5N", "slug": "leh-to-leh-with-turtuk-5n" },
    { "id": "7b8b17de-5691-4eed-ae76-b834b52100ec", "title": "Leh to Leh with Umling La, Hanle & Tso Moriri", "slug": "leh-to-leh-with-umling-la-hanle-tso-moriri" },
    { "id": "45fb8007-1088-436c-8472-10783002f7a9", "title": "Sri Lanka", "slug": "sri-lanka" },
    { "id": "7a6903f0-ff2a-4816-9b66-a2b337d0fba6", "title": "Japan", "slug": "japan" },
    { "id": "670992ff-24ac-43fe-a0a3-5a4c2c19ed53", "title": "Almaty", "slug": "almaty" },
    { "id": "5a220162-dffa-43ab-8d3c-42e9959189b6", "title": "Dubai", "slug": "dubai" },
    { "id": "4596d76a-c3bf-4555-97b4-656636225f98", "title": "Bali", "slug": "bali" },
    { "id": "2f0ea5c3-f8d4-4c2f-9156-b2ad011fca7d", "title": "Kedarnath 3N", "slug": "kedarnath-yatra" },
    { "id": "bc006aec-a940-47cc-93c8-a56c6bcba83b", "title": "Teen Taal 3N", "slug": "teen-taal" },
    { "id": "2cd68b3f-bbae-41d4-93e6-b77f70119855", "title": "Veitnam", "slug": "vietnam" },
    { "id": "23fc4e0e-40e3-4767-81c8-9dc6bdcd7608", "title": "Sangla Holi 3N 4D", "slug": "sangla-holi-special" },
    { "id": "e0615ffb-27d0-48c8-9cf7-0acbb16204a0", "title": "Spiti With Sangla 6N 7D", "slug": "spiti-valley-with-sangla-holi" },
    { "id": "3efb8866-7ac1-4b96-a8c6-7c2e5496843c", "title": "Thailand  Songkaran", "slug": "thailand-songkran-festival" },
    { "id": "341c59dc-8934-451c-8b9e-66c99445f2ec", "title": "Bali with Gili T.", "slug": "bali-with-nusa-gili-t" },
    { "id": "6f022cf3-5d5b-426c-8515-5120614eb58e", "title": "4x4 Summer Spiti Expedition (6N7D)", "slug": "4x4-summer-spiti" }
];

async function run() {
    // We will use the REST API for fetching minimum prices since MCP throws access denied inside node sometimes
    // No wait, Supabase REST API needs ANON KEY, let's just parse the dump we already have.
    let minPrices = {};

    // We already have parse_excel.json with standard prices, and we can also use the output db dump if needed.
    // Wait, the user has an endpoint in framer-website (edge function or similar), let's just use the excel dump's lowest base price as the "price"!
    // Better yet, we can hit Supabase REST API since we have VITE_SUPABASE_URL and ANON_KEY

    let ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
    let SUPA_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    if (!ANON_KEY || !SUPA_URL) {
        throw new Error("Missing Supabase credentials. Set SUPABASE_URL and SUPABASE_ANON_KEY (or VITE_ equivalents).");
    }

    const res = await fetch(`${SUPA_URL}/rest/v1/trip_pricing?select=trip_id,price&price=gt.0`, {
        headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}` }
    });

    if (!res.ok) {
        console.error("Failed to fetch prices:", await res.text());
        return;
    }
    const pricing = await res.json();

    pricing.forEach(p => {
        if (!minPrices[p.trip_id] || p.price < minPrices[p.trip_id]) {
            minPrices[p.trip_id] = p.price;
        }
    });

    console.log("Calculated min prices for trips.");

    const transport = new SSEClientTransport(new URL(MCP_URL));
    const client = new Client({ name: "sync-client", version: "1.0.0" }, { capabilities: {} });
    await client.connect(transport);

    try {
        const framerRes = await client.callTool({
            name: "getCMSItems",
            arguments: { collectionId: COLLECTION_ID, limit: 100 }
        });
        const framerItems = framerRes.content[0].text ? JSON.parse(framerRes.content[0].text).items : framerRes.content.items;

        for (const fItem of framerItems) {
            const rawTitle = fItem.fieldData.edpZYc3f0?.value || fItem.fieldData.edpZYc3f0 || "";
            const fTitle = String(rawTitle).toLowerCase().replace(/[^a-z0-9 ]/g, '');
            const sMatch = supabaseTrips.find(st => {
                const lowSt = st.title.toLowerCase().replace(/[^a-z0-9 ]/g, '');
                return fTitle.includes(lowSt) || lowSt.includes(fTitle);
            });

            if (sMatch) {
                const tripId = sMatch.id;
                const minPrice = minPrices[tripId];

                let updates = {
                    sOpVBzQ8v: { type: "string", value: tripId }
                };

                if (minPrice) {
                    updates.L131_KPPt = { type: "number", value: minPrice };
                }

                console.log(`Updating '${sMatch.title}' in Framer. ID: ${tripId}, Base Price: ${minPrice || 'None found'}`);

                await client.callTool({
                    name: "upsertCMSItem",
                    arguments: {
                        collectionId: COLLECTION_ID,
                        itemId: fItem.id,
                        fieldData: updates
                    }
                });
            }
        }
    } catch (e) { console.error(e); }
    finally { await client.close(); }
}
run();
