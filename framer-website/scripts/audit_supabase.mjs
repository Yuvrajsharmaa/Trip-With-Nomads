import { createClient } from "@supabase/supabase-js";

const SUPABASE_TARGET = String(process.env.SUPABASE_TARGET || "staging")
    .trim()
    .toLowerCase();
const STAGING_SUPABASE_URL = "https://ieuwiinbvbdvjrdqqzlb.supabase.co";
const ALLOW_PRODUCTION = String(process.env.ALLOW_PRODUCTION || "")
    .trim()
    .toLowerCase() === "true";

const providedSupabaseUrl = String(process.env.SUPABASE_URL || "").trim();
if (SUPABASE_TARGET === "production") {
    if (!ALLOW_PRODUCTION) {
        console.error(
            "Refusing production target. Re-run with ALLOW_PRODUCTION=true SUPABASE_TARGET=production."
        );
        process.exit(1);
    }
    if (!providedSupabaseUrl) {
        console.error("Production target requires explicit SUPABASE_URL.");
        process.exit(1);
    }
}

const SUPABASE_URL = providedSupabaseUrl || STAGING_SUPABASE_URL;
const SUPABASE_KEY = String(
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || ""
).trim();

if (!SUPABASE_KEY) {
    console.error("Missing SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY.");
    process.exit(1);
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
