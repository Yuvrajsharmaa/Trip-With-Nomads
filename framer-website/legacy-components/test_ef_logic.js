const { createClient } = require('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');

// Using the same credentials
const SUPABASE_URL = "https://jxozzvwvprmnhvafmpsa.supabase.co";
const SUPABASE_ANON_KEY = "__SUPABASE_ANON_KEY_PRODUCTION__";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function testEdgeFunction() {
    console.log("Testing Edge Function with NEW payload...");

    const payload = {
        trip_id: "66d08175-8a57-4d7c-ab08-b888aa771693",
        departure_date: "2026-01-22",
        transport: "traveller",
        sharing: "double", // Use lowercase as per DB check result
        name: "Edge Probe",
        email: "probe@test.com",
        amount: 23999,
        phone: "9999999999"
    };

    const { data, error } = await supabase.functions.invoke("create-booking", {
        body: payload,
    });

    if (error) {
        console.error("❌ Function returned error:", error);
    } else {
        console.log("✅ Function success:", data);
    }
}
// Note: Node.js env here doesn't have fetch/createClient directly without npm install. 
// I will use HTML/Browser to run this since I can't install npm packages easily (took long time before).
