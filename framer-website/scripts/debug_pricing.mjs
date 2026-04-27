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

const TRIP_ID = "a1b86c67-45e9-4193-a645-ea1a74d0af09"; // Winter Spiti

async function check() {
    console.log(`Fetching pricing for Trip ID: ${TRIP_ID}`);
    const url = `${SUPABASE_URL}/rest/v1/trip_pricing?trip_id=eq.${TRIP_ID}&select=*`;

    try {
        const res = await fetch(url, {
            headers: {
                apikey: SUPABASE_KEY,
                Authorization: `Bearer ${SUPABASE_KEY}`,
            },
        });

        if (!res.ok) {
            console.error("HTTP Error:", res.status, res.statusText);
            const text = await res.text();
            console.error("Body:", text);
            return;
        }

        const data = await res.json();
        console.log(`Found ${data.length} rows.`);

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const valid = data.filter(r => new Date(r.start_date) >= today);
        console.log(`Found ${valid.length} FUTURE dates.`);
        console.log("Sample rows:", JSON.stringify(data.slice(0, 3), null, 2));

    } catch (e) {
        console.error("Fetch Error:", e);
    }
}

check();
