import crypto from 'crypto';
import fs from 'fs';

// PDF Trips (from prompt)
const LIVE_TRIPS_PDF = [
    { title: "Summer Spiti with Chandrataal (6N7D)", clean: "Summer Spiti" },
    { title: "4x4 Summer Spiti Expedition (6N7D)", clean: "4x4 Summer Spiti Expedition" },
    { title: "Spiti Biking", clean: "Spiti Biking" },
    { title: "Manali with Chandrataal (Delhi-Delhi)", clean: "Manali With Chandrataal 2N" },
    { title: "Teen Taal (Delhi-Delhi)", clean: "Teen Taal 3N" },
    { title: "Teen Taal with Gombo Ranjan", clean: "Teen Taal with Gopuranjan 4N" }, // matching Supabase name for mapping
    { title: "Zanskar Valley 6N7D (Tempo Traveller)", clean: "Zanskar 6N" },
    { title: "Kedarnath Yatra 3N4D", clean: "Kedarnath 3N" },
    { title: "Leh-Leh with Turtuk 5N6D", clean: "Leh to Leh with Turtuk 5N" },
    { title: "Leh-Leh with Turtuk 6N7D", clean: "Leh to Leh with Turtuk 6N" },
    { title: "Ladakh - Hanle & Umling La - 7N8D", clean: "Leh to Leh with Umling La, Hanle & Tso Moriri" },
    { title: "Winter Spiti Expedition 6N7D", clean: "Winter spiti" },
    { title: "Spiti Valley with Sangla Holi 6N7D", clean: "Spiti With Sangla 6N 7D" },
    { title: "Sangla Holi 3N4D", clean: "Sangla Holi 3N 4D" },
    { title: "Ladakh Apricot Blossom 6N7D", clean: "Ladakh apricot blossom" },
    { title: "Bali 8N9D", clean: "Bali" },
    { title: "Thailand Songkran Festival", clean: "Thailand Songkaran" },
    { title: "Thailand Full Moon Party", clean: "Thailand Full Moon" },
    { title: "Almaty", clean: "Almaty" },
    { title: "Sri Lanka", clean: "Sri Lanka" },
    { title: "Dubai", clean: "Dubai" },
    { title: "Japan Cherry Blossom", clean: "Japan" }
];

const supabaseTrips = [
    { "id": "66d08175-8a57-4d7c-ab08-b888aa771693", "title": "Bir Weekend Trip", "slug": null },
    { "id": "a1b86c67-45e9-4193-a645-ea1a74d0af09", "title": "Winter spiti", "slug": "winter-spiti-expedition" },
    { "id": "fae90e04-3c77-4878-9b6b-a5f1e7e37fa7", "title": "Thailand Full Moon", "slug": "thailand-full-moon-party" },
    { "id": "1d081900-96e7-491d-b30e-0f637476b40d", "title": "Baku without Shahdag", "slug": "baku-without-shahdag" },
    { "id": "1f80ad9b-ffe2-40c2-8f63-e9e228646ffc", "title": "Summer Spiti", "slug": "summer-spiti" },
    { "id": "67f214ed-0655-47d5-8aff-d2c485d3ad01", "title": "Spiti Biking", "slug": "spiti-biking" },
    { "id": "ec0ced81-2733-44c4-bba0-fed589922bbe", "title": "Short Spiti 4N 5D", "slug": "short-spiti-4n-5d" },
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
    { "id": "66615e8f-21b8-44d9-986e-318755610237", "title": "georgia", "slug": "georgia" },
    { "id": "5a220162-dffa-43ab-8d3c-42e9959189b6", "title": "Dubai", "slug": "dubai" },
    { "id": "4596d76a-c3bf-4555-97b4-656636225f98", "title": "Bali", "slug": "bali" },
    { "id": "2f0ea5c3-f8d4-4c2f-9156-b2ad011fca7d", "title": "Kedarnath 3N", "slug": "kedarnath-yatra" },
    { "id": "74497b7e-8d3d-49dc-afd5-c09c268d048d", "title": "Kedarnath With Badrinath 4N", "slug": "do-dhaam" },
    { "id": "341c59dc-8934-451c-8b9e-66c99445f2ec", "title": "Bali with Gili T.", "slug": "bali-with-nusa-gili-t" },
    { "id": "bc006aec-a940-47cc-93c8-a56c6bcba83b", "title": "Teen Taal 3N", "slug": "teen-taal" },
    { "id": "2cd68b3f-bbae-41d4-93e6-b77f70119855", "title": "Veitnam", "slug": "vietnam" },
    { "id": "23fc4e0e-40e3-4767-81c8-9dc6bdcd7608", "title": "Sangla Holi 3N 4D", "slug": "sangla-holi-special" },
    { "id": "e0615ffb-27d0-48c8-9cf7-0acbb16204a0", "title": "Spiti With Sangla 6N 7D", "slug": "spiti-valley-with-sangla-holi" },
    { "id": "3efb8866-7ac1-4b96-a8c6-7c2e5496843c", "title": "Thailand  Songkaran", "slug": "thailand-songkran-festival" }
];

// Read framer items output (I will use previously discovered IDs manually compiled for the ones that matched)
// Framer items missing: 
// - Spiti Biking
// - Manali with Chandrataal
// - Teen Taal with Gombo Ranjan
// - Zanskar Valley
// - Leh-Leh with Turtuk 5N6D
// - Leh-Leh with Turtuk 6N7D  (wait in my previous run both 5N and 6N failed to match Framer "Ladakh Leh to Leh With Turtuk")
// - Sangla Holi
// - Bali
// - 4x4 Summer Spiti Expedition

const framerTripTitlesPresent = [
    "Ladakh Leh to Leh With Turtuk",
    "Leh to Leh with Umling La, Hanle & Tso Moriri",
    "Kedarnath Yatra",
    "Do Dhaam",
    "Ladakh Apricot Blossom",
    "Bali with Nusa & Gili T",
    "Teen taal",
    "Baku without Shahdag",
    "Baku with Shahdag",
    "Vietnam",
    "Dubai",
    "Sangla Holi Special", // wait, "Sangla Holi 3N4D" was marked missing because it didn't match perfectly, but it's here! PDF: "Sangla Holi 3N4D", matches "Sangla Holi Special".
    "Sri Lanka",
    "Spiti Valley with sangla holi",
    "Thailand Songkran Festival",
    "The Great Kashmir",
    "Winter Spiti Expedition",
    "Almaty",
    "Japan",
    "Thailand full moon party",
    "Summer Spiti"
];

const createSlug = (str) => str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

const syncPlan = {
    supabase_inserts: [],
    framer_drafts: [],
    framer_sync_ids: []
};

for (const pdfTrip of LIVE_TRIPS_PDF) {
    // 1. Find in Supabase
    let sbTrip = supabaseTrips.find(t => t.title === pdfTrip.clean);

    if (!sbTrip) {
        // Prepare Supabase insert
        const newId = crypto.randomUUID();
        sbTrip = { id: newId, title: pdfTrip.title, slug: createSlug(pdfTrip.title) };
        syncPlan.supabase_inserts.push(sbTrip);
    }

    // 2. Find in Framer
    let frTripTitle = framerTripTitlesPresent.find(t => t.toLowerCase() === pdfTrip.title.toLowerCase() || t.toLowerCase() === pdfTrip.clean.toLowerCase());

    // Fuzzy matching for framer
    if (!frTripTitle) {
        if (pdfTrip.title.includes("Sangla Holi 3N4D")) frTripTitle = "Sangla Holi Special";
        if (pdfTrip.title.includes("Summer Spiti with Chandrataal")) frTripTitle = "Summer Spiti";
        if (pdfTrip.title.includes("Ladakh - Hanle")) frTripTitle = "Leh to Leh with Umling La, Hanle & Tso Moriri";
        if (pdfTrip.title.includes("Kedarnath Yatra")) frTripTitle = "Kedarnath Yatra";
        if (pdfTrip.title.includes("Winter Spiti Expedition")) frTripTitle = "Winter Spiti Expedition";
        if (pdfTrip.title.includes("Spiti Valley with Sangla Holi")) frTripTitle = "Spiti Valley with sangla holi";
        if (pdfTrip.title.includes("Ladakh Apricot Blossom")) frTripTitle = "Ladakh Apricot Blossom";
        if (pdfTrip.title.includes("Thailand Songkran")) frTripTitle = "Thailand Songkran Festival";
        if (pdfTrip.title.includes("Thailand Full Moon")) frTripTitle = "Thailand full moon party";
        if (pdfTrip.title.includes("Sri Lanka")) frTripTitle = "Sri Lanka";
        if (pdfTrip.title.includes("Dubai")) frTripTitle = "Dubai";
        if (pdfTrip.title.includes("Almaty")) frTripTitle = "Almaty";
        if (pdfTrip.title.includes("Japan")) frTripTitle = "Japan";
        if (pdfTrip.title === "Teen Taal (Delhi-Delhi)") frTripTitle = "Teen taal";
    }

    if (frTripTitle) {
        // Will need to sync ID (not adding here since we need Framer item IDs to do that, I'll log it)
        syncPlan.framer_sync_ids.push({ title: frTripTitle, supabase_id: sbTrip.id });
    } else {
        // Missing in Framer, create draft
        // Need ID, Slug, and Title
        syncPlan.framer_drafts.push({
            title: pdfTrip.title,
            slug: createSlug(pdfTrip.title),
            trip_id: sbTrip.id
        });
    }
}

fs.writeFileSync('sync_plan.json', JSON.stringify(syncPlan, null, 2));
console.log("Sync plan generated.");
