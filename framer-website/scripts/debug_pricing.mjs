
const SUPABASE_URL = "https://jxozzvwvprmnhvafmpsa.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp4b3p6dnd2cHJtbmh2YWZtcHNhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgwNTg2NjIsImV4cCI6MjA4MzYzNDY2Mn0.KpVa9dWlJEguL1TA00Tf4QDpziJ1mgA2I0f4_l-vlOk";

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
