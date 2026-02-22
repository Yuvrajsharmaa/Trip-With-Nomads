
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    console.log("Creating Admin User...");
    const email = 'testuser@gmail.com';
    const password = 'password123';

    const { data, error } = await supabase.auth.signUp({
        email,
        password,
    });

    if (error) {
        console.error("Error creating user:", error.message);
    } else {
        console.log("User created:", data.user?.email);
        console.log("Check your email for confirmation link if enabled, or just login if auto-confirm is on.");
    }
}

run();
