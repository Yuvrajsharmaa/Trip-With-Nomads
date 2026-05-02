const { createClient } = require('@supabase/supabase-js');

// Extracted from user's provided string
const SUPABASE_URL = "https://jxozzvwvprmnhvafmpsa.supabase.co";
const SUPABASE_ANON_KEY = "__SUPABASE_ANON_KEY_PRODUCTION__";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function testConnection() {
    console.log("Testing connection to trip_pricing...");
    const { data, error } = await supabase
        .from("trip_pricing")
        .select("*")
        .limit(5);

    if (error) {
        console.error("Error fetching trip_pricing:", error);
    } else {
        console.log("Successfully fetched trip_pricing data:", data);
    }

    console.log("\nTesting connection to trips...");
    const { data: trips, error: tripError } = await supabase
        .from("trips")
        .select("*")
        .limit(1);

    if (tripError) {
        console.error("Error fetching trips:", tripError);
    } else {
        console.log("Successfully fetched trips data:", trips);
    }
}

testConnection();
