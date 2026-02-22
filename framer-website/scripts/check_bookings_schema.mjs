
const SUPABASE_URL = "https://jxozzvwvprmnhvafmpsa.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp4b3p6dnd2cHJtbmh2YWZtcHNhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgwNTg2NjIsImV4cCI6MjA4MzYzNDY2Mn0.KpVa9dWlJEguL1TA00Tf4QDpziJ1mgA2I0f4_l-vlOk";

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
