import fs from 'fs';
import { createClient } from "@supabase/supabase-js";
import crypto from 'crypto';

// Configuration (Should match BookingOverrides.tsx)
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error("Missing Supabase credentials. Set SUPABASE_URL and SUPABASE_ANON_KEY (or VITE_ equivalents).");
}

const client = createClient(SUPABASE_URL, SUPABASE_KEY);

async function run() {
    console.log("--- Starting Data Import ---");

    // 1. Read Trips CSV
    const tripsRaw = fs.readFileSync('clean_trips.csv', 'utf-8').split('\n').slice(1); // Skip header
    const slugToId = {};

    console.log(`Processing ${tripsRaw.length} trips...`);

    for (const line of tripsRaw) {
        if (!line.trim()) continue;

        // Simple parse (assuming no commas in fields for now, or handled by generation)
        // clean_trips: title,slug,duration_text
        // But title is quoted "Winter spiti"
        const matches = line.match(/^"(.*?)",([^,]+),"(.*?)",/);
        if (!matches) {
            console.warn("Skipping line (parse error):", line);
            continue;
        }

        const title = matches[1];
        const slug = matches[2];
        const duration = matches[3];

        // Upsert Trip logic
        // Try to find by slug first
        let { data: existing } = await client.from('trips').select('id').eq('slug', slug).single();

        let id;
        if (existing) {
            console.log(`Update Trip: ${slug}`);
            const { error } = await client.from('trips').update({ title, duration_text: duration }).eq('id', existing.id);
            if (error) console.error("Update Error:", error.message);
            id = existing.id;
        } else {
            console.log(`Insert Trip: ${slug}`);
            const { data: inserted, error } = await client.from('trips').insert({
                id: crypto.randomUUID(),
                title,
                slug,
                duration_text: duration,
                active: true
            }).select('id').single();

            if (error) {
                console.error(`Insert Error (${slug}):`, error.message);
                continue;
            }
            id = inserted.id;
        }
        slugToId[slug] = id;
    }

    // 2. Read Pricing CSV
    console.log("\nProcessing Pricing...");
    const pricingRaw = fs.readFileSync('clean_pricing.csv', 'utf-8').split('\n').slice(1);

    // Determine today for filter? No, import all future.

    let pricingCount = 0;
    for (const line of pricingRaw) {
        if (!line.trim()) continue;
        // trip_slug,variant_name,price,start_date,end_date,seats_available
        const cols = line.split(',');
        const slug = cols[0];
        const variantName = cols[1].replace(/"/g, ''); // Unquote
        const price = parseFloat(cols[2]);
        const startDate = cols[3];
        // ...

        const tripId = slugToId[slug];
        if (!tripId) {
            console.warn(`Skipping pricing for unknown slug: ${slug}`);
            continue;
        }

        // Check duplicate?
        // Just insert for now (assuming users clear or we handle dupes manually)
        // Or check existence
        const { data: exists } = await client.from('trip_pricing')
            .select('id')
            .eq('trip_id', tripId)
            .eq('variant_name', variantName)
            .eq('start_date', startDate)
            .maybeSingle();

        if (exists) {
            // Skip
        } else {
            const { error } = await client.from('trip_pricing').insert({
                trip_id: tripId,
                variant_name: variantName,
                price: price,
                start_date: startDate
                // seats_available removed as column might be missing
            });
            if (error) console.error("Pricing Insert Error:", error.message);
            else pricingCount++;
        }
    }

    console.log(`\nImport Complete! Imported ${Object.keys(slugToId).length} trips and ${pricingCount} pricing rows.`);
}

run();
