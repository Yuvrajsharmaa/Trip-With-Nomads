import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
// From BookingOverrides.tsx
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error("Missing Supabase credentials. Set SUPABASE_URL and SUPABASE_ANON_KEY (or VITE_ equivalents).");
}

const client = createClient(SUPABASE_URL, SUPABASE_KEY);

async function run() {
    console.log("--- SUPABASE LIVE AUDIT ---");

    // 1. TRIPS
    console.log("\n[1] Checking 'trips' table...");
    const { data: trips, error: tripsError } = await client.from("trips").select("*");

    if (tripsError) {
        console.error("ERROR Fetching Trips:", tripsError.message);
    } else {
        console.log(`Found ${trips.length} trips.`);
        if (trips.length > 0) {
            console.log("Columns:", Object.keys(trips[0]).join(", "));
            trips.forEach(t => console.log(`- ID: ${t.id}, Slug: ${t.slug}, Title: ${t.title}`));
        } else {
            console.warn("WARNING: 'trips' table is empty!");
        }
    }

    // 2. BOOKINGS (Columns Check)
    console.log("\n[2] Checking 'bookings' table structure...");
    // We try to select 1 row to see columns. If RLS blocks, we might get error or empty array.
    const { data: bookings, error: bookingsError } = await client.from("bookings").select("*").limit(1);

    if (bookingsError) {
        console.error("ERROR Fetching Bookings:", bookingsError.message);
        // Note: RLS might block SELECT but INSERT works. 
        // We assume schema is derived from our migration file if inspection fails.
    } else {
        if (bookings && bookings.length > 0) {
            console.log("Columns:", Object.keys(bookings[0]).join(", "));
        } else {
            console.log("Table accessible (no error) but empty or RLS restricted read.");
        }
    }

    // 3. Payment Attempts (if exists)
    console.log("\n[3] Checking 'payment_attempts' table...");
    const { data: pa, error: paError } = await client.from("payment_attempts").select("*").limit(1);
    if (paError) {
        console.log("Note: 'payment_attempts' table check failed (might not exist or RLS):", paError.message);
    } else {
        console.log("Table 'payment_attempts' exists.");
    }
}

run();
