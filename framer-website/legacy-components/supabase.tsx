// supabase.ts
import { createClient } from "@supabase/supabase-js"

// Note: Base URL for the project, not the function URL
export const SUPABASE_URL = "https://jxozzvwvprmnhvafmpsa.supabase.co"
export const SUPABASE_ANON_KEY =
    "__SUPABASE_ANON_KEY_PRODUCTION__"

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// Helper to call the Edge Function
export async function createBooking(payload: any) {
    const { data, error } = await supabase.functions.invoke("create-booking", {
        body: payload,
    })
    return { data, error }
}

