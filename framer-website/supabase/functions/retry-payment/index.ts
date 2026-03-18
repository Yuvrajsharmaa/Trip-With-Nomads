
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function isUuid(value: unknown): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        String(value || '').trim()
    )
}

function normalizeEmail(value: unknown): string {
    return String(value || '').trim().toLowerCase()
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
        const isTest = Deno.env.get('PAYU_TEST_MODE') === 'true'
        const payuKey = isTest
            ? Deno.env.get('PAYU_TEST_KEY') || Deno.env.get('PAYU_KEY')
            : Deno.env.get('PAYU_LIVE_KEY') || Deno.env.get('PAYU_KEY')
        const payuSalt = isTest
            ? Deno.env.get('PAYU_TEST_SALT') || Deno.env.get('PAYU_SALT')
            : Deno.env.get('PAYU_LIVE_SALT') || Deno.env.get('PAYU_SALT')

        if (!supabaseUrl || !supabaseKey) {
            throw new Error('Missing Supabase Secrets (URL/RoleKey)')
        }
        if (!payuKey || !payuSalt) {
            throw new Error('Missing PayU Secrets (PAYU_KEY/PAYU_SALT)')
        }

        const body = await req.json().catch(() => ({}))
        const bookingId = String(body?.booking_id || '').trim()
        const providedEmail = normalizeEmail(body?.email)

        if (!isUuid(bookingId)) {
            return new Response(JSON.stringify({ error: 'Invalid booking_id format' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 400,
            })
        }
        if (!providedEmail) {
            return new Response(JSON.stringify({ error: 'Email is required for retry' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 400,
            })
        }

        const supabase = createClient(supabaseUrl, supabaseKey)
        const { data: booking, error } = await supabase
            .from('bookings')
            .select('id, booking_ref, name, email, phone, total_amount, payable_now_amount, payment_status')
            .eq('id', bookingId)
            .single()

        if (error || !booking) throw new Error('Booking not found')
        if (booking.payment_status === 'paid') throw new Error('Booking already paid')

        const bookingEmail = normalizeEmail(booking.email)
        if (!bookingEmail || bookingEmail !== providedEmail) {
            return new Response(JSON.stringify({ error: 'Booking not found' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 404,
            })
        }

        const timestamp = Date.now().toString().slice(-4)
        const bookingRefCore = String(booking.booking_ref || '').replace('TWN-', '') || bookingId.slice(0, 8)
        const txnid = `${bookingRefCore}-${timestamp}`

        const payableNow = Number(booking.payable_now_amount) > 0
            ? Number(booking.payable_now_amount)
            : Number(booking.total_amount)
        const amount = payableNow.toFixed(2)
        const productinfo = 'Trip Booking'
        const firstname = String(booking.name || '').trim().split(' ')[0] || 'Guest'
        const email = String(booking.email || '').trim()
        const phone = String(booking.phone || '').trim()

        const hashString = `${payuKey}|${txnid}|${amount}|${productinfo}|${firstname}|${email}|${bookingId}||||||||||${payuSalt}`
        const hashBuffer = await crypto.subtle.digest('SHA-512', new TextEncoder().encode(hashString))
        const hash = Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, '0')).join('')

        const payuBase = isTest ? 'https://test.payu.in/_payment' : 'https://secure.payu.in/_payment'

        return new Response(
            JSON.stringify({
                payu: {
                    action: payuBase,
                    key: payuKey,
                    txnid,
                    amount,
                    productinfo,
                    firstname,
                    email,
                    phone,
                    surl: `${supabaseUrl}/functions/v1/handle-payment`,
                    furl: `${supabaseUrl}/functions/v1/handle-payment`,
                    hash,
                    udf1: bookingId,
                }
            }),
            {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            }
        )
    } catch (error: any) {
        return new Response(JSON.stringify({ error: String(error?.message || 'Retry payment failed') }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        })
    }
})
