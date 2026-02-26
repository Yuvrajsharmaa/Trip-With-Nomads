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
            name,
            email,
            trip_id,
            departure_date,
            sharing,
            transport,
            amount,
            phone,
        } = body

        // Validation
        if (!name || !email || !trip_id || !departure_date || !sharing || !transport) {
            return new Response(
                JSON.stringify({ error: "Missing required fields (name, email, trip_id, departure_date, sharing, transport)" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            )
        }

        // --- PayU Hash Generation Setup ---
        const IS_TEST = Deno.env.get("PAYU_TEST_MODE") === "true"

        let PAYU_KEY = Deno.env.get("PAYU_KEY")
        let PAYU_SALT = Deno.env.get("PAYU_SALT")

        // Override with specific keys if mode is set
        if (IS_TEST) {
            PAYU_KEY = Deno.env.get("PAYU_TEST_KEY") || PAYU_KEY
            PAYU_SALT = Deno.env.get("PAYU_TEST_SALT") || PAYU_SALT
        } else {
            PAYU_KEY = Deno.env.get("PAYU_LIVE_KEY") || PAYU_KEY
            PAYU_SALT = Deno.env.get("PAYU_LIVE_SALT") || PAYU_SALT
        }

        if (!PAYU_KEY || !PAYU_SALT) {
            console.error("❌ MISSING PAYU SECRETS")
            return new Response(JSON.stringify({ error: "Server Configuration Error: Payment Keys Missing" }), { status: 500, headers: corsHeaders })
        }

        console.log(`🔐 Using PayU Key: ${PAYU_KEY.substring(0, 4)}... (Test Mode: ${IS_TEST})`)

        // Generate TxnID EARLY so we can save it to DB
        const shortTxnId = "txn_" + Date.now().toString().slice(-10) + Math.floor(Math.random() * 10000)

        // --- Database Insert ---
        const supabase = createClient(
            Deno.env.get("SUPABASE_URL")!,
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
        )

        const { data, error } = await supabase
            .from("bookings")
            .insert({
                name,
                email,
                trip_id,
                departure_date,
                sharing,
                transport,
                amount,
                phone,
                payment_status: "pending",
                payu_txnid: shortTxnId, // Now this variable exists!
            })
            .select()
            .single()

        if (error) {
            console.error("❌ Supabase insert error:", error)
            return new Response(JSON.stringify({ error: error.message }), {
                status: 500,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            })
        }

        // --- Calculate Hash ---
        const productinfo = "Trip Booking"
        const firstname = name.split(" ")[0]
        const udf1 = data.id

        const hashString = `${PAYU_KEY}|${shortTxnId}|${amount}|${productinfo}|${firstname}|${email}|${udf1}||||||||||${PAYU_SALT}`

        const encoder = new TextEncoder()
        const dataBuffer = encoder.encode(hashString)
        const hashBuffer = await crypto.subtle.digest("SHA-512", dataBuffer)
        const hashArray = Array.from(new Uint8Array(hashBuffer))
        const hash = hashArray.map(b => b.toString(16).padStart(2, "0")).join("")

        const actionUrl = IS_TEST ? "https://test.payu.in/_payment" : "https://secure.payu.in/_payment"

        return new Response(
            JSON.stringify({
                booking_id: data.id,
                message: "Proceeding to payment",
                payu: {
                    key: PAYU_KEY,
                    txnid: shortTxnId,
                    amount: amount,
                    productinfo: productinfo,
                    firstname: firstname,
                    email: email,
                    phone: phone || "",
                    // IMPORTANT: Point these to your NEW 'handle-payment' Edge Function URL
                    // Example: https://<project-ref>.supabase.co/functions/v1/handle-payment
                    surl: Deno.env.get("PAYMENT_CALLBACK_URL") || "https://tripwithnomads.com/success",
                    furl: Deno.env.get("PAYMENT_CALLBACK_URL") || "https://tripwithnomads.com/failure",
                    hash: hash,
                    udf1: udf1, // Frontend must submit this!
                    action: actionUrl
                }
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        )
    } catch (err) {
        console.error("💥 Edge function crash:", err)
        return new Response(
            JSON.stringify({ error: "Internal server error" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        )
    }
})
