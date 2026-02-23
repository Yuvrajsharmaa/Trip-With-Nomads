
const SUPABASE_URL = "https://jxozzvwvprmnhvafmpsa.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp4b3p6dnd2cHJtbmh2YWZtcHNhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgwNTg2NjIsImV4cCI6MjA4MzYzNDY2Mn0.KpVa9dWlJEguL1TA00Tf4QDpziJ1mgA2I0f4_l-vlOk";

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
