import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
}

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders })
    }

    try {
        const body = await req.json()
        console.log("📥 Incoming booking payload:", body)

        const {
            trip_id,
            departure_date,
            transport,
            travellers,           // [{ name, sharing }]
            payment_breakdown,     // [{ label, price, variant, count }]
            tax_amount,
            total_amount,
            name,                  // Primary contact name
            email,                 // Primary contact email
            phone,                 // Primary contact phone
        } = body

        // Validation
        if (!trip_id || !departure_date || !travellers?.length || !total_amount || !email || !name) {
            console.error("❌ MISSING FIELDS:", { trip_id, departure_date, travellers, total_amount, email, name })
            return new Response(
                JSON.stringify({ error: "Missing required fields (trip_id, date, travellers, amount, email, name)" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            )
        }

        // PayU Setup
        const IS_TEST = Deno.env.get("PAYU_TEST_MODE") === "true"
        let PAYU_KEY = IS_TEST
            ? (Deno.env.get("PAYU_TEST_KEY") || Deno.env.get("PAYU_KEY"))
            : (Deno.env.get("PAYU_LIVE_KEY") || Deno.env.get("PAYU_KEY"))
        let PAYU_SALT = IS_TEST
            ? (Deno.env.get("PAYU_TEST_SALT") || Deno.env.get("PAYU_SALT"))
            : (Deno.env.get("PAYU_LIVE_SALT") || Deno.env.get("PAYU_SALT"))

        if (!PAYU_KEY || !PAYU_SALT) {
            console.error("❌ Payment configuration missing (Key or Salt)")
            return new Response(
                JSON.stringify({ error: "Payment configuration missing" }),
                { status: 500, headers: corsHeaders }
            )
        }

        // Generate Transaction ID
        const txnid = "txn_" + Date.now().toString().slice(-10) + Math.floor(Math.random() * 10000)

        // Insert Booking
        const supabase = createClient(
            Deno.env.get("SUPABASE_URL")!,
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
        )

        const { data, error } = await supabase
            .from("bookings")
            .insert({
                trip_id,
                departure_date,
                transport: transport || "standard",
                travellers,
                payment_breakdown,
                tax_amount,
                total_amount,
                name,
                email,
                phone: phone || "",
                currency: "INR",
                payment_status: "pending",
                payu_txnid: txnid,
            })
            .select()
            .single()

        if (error) {
            console.error("❌ Supabase insert error:", error)
            return new Response(
                JSON.stringify({ error: error.message }),
                { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            )
        }

        // Generate PayU Hash
        // Formula: SHA512(key|txnid|amount|productinfo|firstname|email|udf1|udf2|udf3|udf4|udf5||||||SALT)
        const productinfo = "Trip Booking"
        const firstname = name.split(" ")[0]
        const udf1 = data.id  // Booking UUID for callback lookup

        const hashString = `${PAYU_KEY}|${txnid}|${total_amount}|${productinfo}|${firstname}|${email}|${udf1}||||||||||${PAYU_SALT}`

        const encoder = new TextEncoder()
        const hashBuffer = await crypto.subtle.digest("SHA-512", encoder.encode(hashString))
        const hash = Array.from(new Uint8Array(hashBuffer))
            .map(b => b.toString(16).padStart(2, "0"))
            .join("")

        const actionUrl = IS_TEST
            ? "https://test.payu.in/_payment"
            : "https://secure.payu.in/_payment"

        console.log(`✅ Booking created: ${data.id}. Redirecting to PayU (Test Mode: ${IS_TEST})`)

        return new Response(
            JSON.stringify({
                booking_id: data.id,
                payu: {
                    key: PAYU_KEY,
                    txnid,
                    amount: total_amount.toString(),
                    productinfo,
                    firstname,
                    email,
                    phone: phone || "",
                    surl: Deno.env.get("PAYMENT_CALLBACK_URL") || `${Deno.env.get("SUPABASE_URL")}/functions/v1/handle-payment`,
                    furl: Deno.env.get("PAYMENT_CALLBACK_URL") || `${Deno.env.get("SUPABASE_URL")}/functions/v1/handle-payment`,
                    hash,
                    udf1,
                    action: actionUrl,
                },
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        )
    } catch (err) {
        console.error("💥 Error:", err)
        return new Response(
            JSON.stringify({ error: "Internal server error" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        )
    }
})
