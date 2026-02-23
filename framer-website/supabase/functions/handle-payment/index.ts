import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

serve(async (req) => {
    try {
        const formData = await req.formData()
        const data: any = {}
        for (const [key, value] of formData.entries()) {
            data[key] = value.toString()
        }

        console.log("📥 PayU Response:", data)

        const {
            status,
            txnid,
            amount,
            productinfo,
            firstname,
            email,
            udf1,
            mihpayid,
            hash: receivedHash,
            key,
        } = data

        const supabase = createClient(
            Deno.env.get("SUPABASE_URL")!,
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
        )

        const IS_TEST = Deno.env.get("PAYU_TEST_MODE") === "true"
        let PAYU_SALT = IS_TEST
            ? (Deno.env.get("PAYU_TEST_SALT") || Deno.env.get("PAYU_SALT"))
            : (Deno.env.get("PAYU_LIVE_SALT") || Deno.env.get("PAYU_SALT"))

        let bookingId = udf1
        let booking: any = null

        if (bookingId) {
            const bookingById = await supabase
                .from("bookings")
                .select("id, email, name, total_amount")
                .eq("id", bookingId)
                .single()
            booking = bookingById.data
        }

        // Fallback lookup by txnid when udf1 is missing in gateway callback.
        if (!bookingId && txnid) {
            const bookingByTxn = await supabase
                .from("bookings")
                .select("id, email, name, total_amount")
                .eq("payu_txnid", txnid)
                .order("created_at", { ascending: false })
                .limit(1)
                .maybeSingle()
            booking = bookingByTxn.data
            if (booking?.id) bookingId = booking.id
        }

        const safeUdf1 = udf1 || ""
        const safeEmail = email || booking?.email || ""
        const safeFirstname = firstname || (booking?.name ? booking.name.split(" ")[0] : "") || ""
        const safeProductinfo = productinfo || "Trip Booking"
        const safeAmount = amount || booking?.total_amount?.toString() || ""
        const safeTxnid = txnid || ""
        const safeKey = key || ""

        const hashString = `${PAYU_SALT}|${status}||||||||||${safeUdf1}|${safeEmail}|${safeFirstname}|${safeProductinfo}|${safeAmount}|${safeTxnid}|${safeKey}`

        const encoder = new TextEncoder()
        const hashBuffer = await crypto.subtle.digest("SHA-512", encoder.encode(hashString))
        const calculatedHash = Array.from(new Uint8Array(hashBuffer))
            .map(b => b.toString(16).padStart(2, "0"))
            .join("")

        console.log(`🤖 Comparison: Calculated [${calculatedHash}] vs Received [${receivedHash}]`)

        const isValid = (calculatedHash === receivedHash)
        const isSuccess = (status === "success" && isValid)

        if (bookingId) {
            await supabase
                .from("bookings")
                .update({
                    payment_status: isSuccess ? "paid" : "failed",
                    payu_mihpayid: mihpayid || null,
                })
                .eq("id", bookingId)
        }

        const framerBase = (Deno.env.get("FRAMER_BASE_URL") || "https://twn2.framer.website").replace(/\/+$/, "")
        const targetPage = isSuccess ? "payment-success" : "payment-failed"
        const query = new URLSearchParams()
        if (bookingId) query.set("booking_id", bookingId)
        if (txnid) query.set("txnid", txnid)
        const redirectUrl = `${framerBase}/${targetPage}?${query.toString()}`

        console.log(`🚀 Redirecting to: ${redirectUrl}`)
        return Response.redirect(redirectUrl, 303)

    } catch (err) {
        console.error("💥 Handle Payment Error:", err)
        return new Response("Internal Server Error", { status: 500 })
    }
})
