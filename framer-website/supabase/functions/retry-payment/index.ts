
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
    // handle CORS preflight requests
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
        const isTestMode = Deno.env.get('PAYU_TEST_MODE') === 'true'
        const payuKey = isTestMode
            ? (Deno.env.get('PAYU_TEST_KEY') || Deno.env.get('PAYU_KEY'))
            : (Deno.env.get('PAYU_LIVE_KEY') || Deno.env.get('PAYU_KEY'))
        const payuSalt = isTestMode
            ? (Deno.env.get('PAYU_TEST_SALT') || Deno.env.get('PAYU_SALT'))
            : (Deno.env.get('PAYU_LIVE_SALT') || Deno.env.get('PAYU_SALT'))

        // Validate Secrets
        if (!supabaseUrl || !supabaseKey) {
            throw new Error("Missing Supabase Secrets (URL/RoleKey)")
        }
        if (!payuKey || !payuSalt) {
            throw new Error("Missing PayU Secrets for selected mode (test/live)")
        }

        const { booking_id } = await req.json()

        // 1. Fetch Booking
        const supabase = createClient(supabaseUrl, supabaseKey)
        const { data: booking, error } = await supabase
            .from("bookings")
            .select("*")
            .eq("id", booking_id)
            .single()

        if (error || !booking) throw new Error("Booking not found")

        // 2. Generate New Transaction ID
        const timestamp = Date.now().toString().slice(-4)
        const txnid = `${booking.booking_ref.replace("TWN-", "")}-${timestamp}`

        // 3. Prepare PayU Params
        const amount = booking.total_amount.toFixed(2)
        const productinfo = "Trip Booking"
        const firstname = booking.name.split(" ")[0]
        const email = booking.email
        const phone = booking.phone || ""

        // 4. Generate Hash
        const hashString = `${payuKey}|${txnid}|${amount}|${productinfo}|${firstname}|${email}|${booking.id}||||||||||${payuSalt}`
        const hashBuffer = await crypto.subtle.digest("SHA-512", new TextEncoder().encode(hashString))
        const hash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('')

        const payuBase = isTestMode
            ? "https://test.payu.in/_payment"
            : "https://secure.payu.in/_payment"

        return new Response(
            JSON.stringify({
                payu: {
                    action: payuBase,
                    key: payuKey,
                    txnid: txnid,
                    amount: amount,
                    productinfo: productinfo,
                    firstname: firstname,
                    email: email,
                    phone: phone,
                    surl: `${supabaseUrl}/functions/v1/handle-payment`,
                    furl: `${supabaseUrl}/functions/v1/handle-payment`,
                    hash: hash,
                    udf1: booking.id
                }
            }),
            {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            }
        )
    } catch (error: any) {
        return new Response(JSON.stringify({ error: error?.message || "Unknown error" }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        })
    }
})
