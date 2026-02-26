
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error("Missing Supabase credentials. Set SUPABASE_URL and SUPABASE_ANON_KEY (or VITE_ equivalents).");
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
