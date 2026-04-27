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

async function checkBookings() {
    console.log(`Fetching one booking to check schema...`);
    const url = `${SUPABASE_URL}/rest/v1/bookings?select=*&limit=1`;

    try {
        const res = await fetch(url, {
            headers: {
                apikey: SUPABASE_KEY,
                Authorization: `Bearer ${SUPABASE_KEY}`,
            },
        });

        if (!res.ok) {
            console.error("HTTP Error:", res.status, res.statusText);
            return;
        }

        const data = await res.json();
        if (data.length > 0) {
            console.log("Booking columns:", Object.keys(data[0]));
        } else {
            console.log("No bookings found to check columns.");
        }

    } catch (e) {
        console.error("Fetch Error:", e);
    }
}

checkBookings();
