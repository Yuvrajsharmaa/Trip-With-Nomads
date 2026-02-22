// supabase.ts
import { createClient } from "@supabase/supabase-js"

// Note: Base URL for the project, not the function URL
export const SUPABASE_URL = "https://jxozzvwvprmnhvafmpsa.supabase.co"
export const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp4b3p6dnd2cHJtbmh2YWZtcHNhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgwNTg2NjIsImV4cCI6MjA4MzYzNDY2Mn0.KpVa9dWlJEguL1TA00Tf4QDpziJ1mgA2I0f4_l-vlOk"

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// Helper to call the Edge Function
export async function createBooking(payload: any) {
    const { data, error } = await supabase.functions.invoke("create-booking", {
        body: payload,
    })
    return { data, error }
}

