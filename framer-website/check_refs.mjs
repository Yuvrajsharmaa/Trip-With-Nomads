
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error("Missing Supabase credentials. Set SUPABASE_URL and SUPABASE_ANON_KEY (or VITE_ equivalents).");
}

async function checkBooking() {
    // using the exact query from withBookingStatus
    const url = `${SUPABASE_URL}/rest/v1/bookings?id=eq.e9192698-dd1b-4d9b-810c-572793135df5&select=*,trip:trips(title)`;
    try {
        const res = await fetch(url, {
            headers: {
                apikey: SUPABASE_KEY,
                Authorization: `Bearer ${SUPABASE_KEY}`,
            },
        });
        const data = await res.json();
        console.log("Booking Data:", JSON.stringify(data, null, 2));
    } catch (e) {
        console.error(e);
    }
}

checkBooking();
