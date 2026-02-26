/* scripts/verify_live_trips_v2.mjs */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { EventSource } from "eventsource";
import fs from 'fs';
import path from 'path';

global.EventSource = EventSource;

const MCP_URL = "https://mcp.unframer.co/sse?id=73506ef3a425ea9adf787e19fc7caddc64fe18181bcc24132d988e0397845253&secret=RPs6iEkPhdSWx5ek9fM4FoVAogTQ9izt";
const COLLECTION_ID = "Z1Bphf6oI";

const LIVE_TRIPS_PDF = [
    "Summer Spiti with Chandrataal (6N7D)",
    "4x4 Summer Spiti Expedition (6N7D)",
    "Spiti Biking",
    "Manali with Chandrataal (Delhi-Delhi)",
    "Teen Taal (Delhi-Delhi)",
    "Teen Taal with Gombo Ranjan",
    "Zanskar Valley 6N7D (Tempo Traveller)",
    "Kedarnath Yatra 3N4D",
    "Leh-Leh with Turtuk 5N6D",
    "Leh-Leh with Turtuk 6N7D",
    "Ladakh - Hanle & Umling La - 7N8D",
    "Winter Spiti Expedition 6N7D",
    "Spiti Valley with Sangla Holi 6N7D",
    "Sangla Holi 3N4D",
    "Ladakh Apricot Blossom 6N7D",
    "Bali 8N9D",
    "Thailand Songkran Festival",
    "Thailand Full Moon Party",
    "Almaty",
    "Sri Lanka",
    "Dubai",
    "Japan Cherry Blossom"
];

const supabaseTrips = [
    { "id": "66d08175-8a57-4d7c-ab08-b888aa771693", "title": "Bir Weekend Trip", "slug": null },
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
    { "id": "341c59dc-8934-451c-8b9e-66c99445f2ec", "title": "Bali with Gili T.", "slug": "bali-with-nusa-gili-t" }
];

async function run() {
    const transport = new SSEClientTransport(new URL(MCP_URL));
    const client = new Client({ name: "verify-client", version: "1.0.0" }, { capabilities: {} });
    let framerItems = [];
    try {
        await client.connect(transport);
        const result = await client.callTool({
            name: "getCMSItems",
            arguments: { collectionId: COLLECTION_ID, limit: 100 }
        });
        const content = result.content[0].text ? JSON.parse(result.content[0].text) : result.content;
        framerItems = content.items;
    } catch (error) {
        console.error("Framer Error:", error);
    } finally {
        await client.close();
    }

    console.log("Detailed Trip Verification Report");
    console.log("=================================\n");
    console.log(`${"Trip Name (PDF)".padEnd(45)} | ${"Supabase Match".padEnd(20)} | ${"Framer Match".padEnd(20)}`);
    console.log("-".repeat(95));

    LIVE_TRIPS_PDF.forEach(pdfTrip => {
        const lowPdf = pdfTrip.toLowerCase();

        // Looser matching: check if any word from database title is in PDF title
        const sMatch = supabaseTrips.find(st => {
            const lowSt = st.title.toLowerCase().replace(/[^a-z0-9 ]/g, '');
            const pdfClean = lowPdf.replace(/[^a-z0-9 ]/g, '');
            return pdfClean.includes(lowSt) || lowSt.includes(pdfClean.split(' ')[0]);
        });

        const fMatch = framerItems.find(fi => {
            const lowFt = fi.fieldData.edpZYc3f0.value.toLowerCase().replace(/[^a-z0-9 ]/g, '');
            const pdfClean = lowPdf.replace(/[^a-z0-9 ]/g, '');
            return pdfClean.includes(lowFt) || lowFt.includes(pdfClean.split(' ')[0]);
        });

        console.log(`${pdfTrip.padEnd(45)} | ${(sMatch ? sMatch.title : "❌").padEnd(20)} | ${(fMatch ? fMatch.fieldData.edpZYc3f0.value : "❌").padEnd(20)}`);
    });
}

run();
