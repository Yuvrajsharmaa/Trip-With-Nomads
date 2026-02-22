/* scripts/fetch_supabase_trips.mjs */
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
// import dotenv from 'dotenv';
// dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    console.log("Fetching Trips from Supabase...");
    const { data, error } = await supabase
        .from('trips')
        .select('id, title, slug');

    if (error) {
        console.error("Error:", error);
        return;
    }

    console.log(`Fetched ${data.length} trips.`);
    fs.writeFileSync('supabase_trips.json', JSON.stringify(data, null, 2));
}

run();
