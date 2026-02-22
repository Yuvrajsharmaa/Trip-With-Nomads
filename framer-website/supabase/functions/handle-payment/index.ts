import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

serve(async (req) => {
    try {
        // PayU sends data as Form Data (application/x-www-form-urlencoded)
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
            udf1, // This is our Booking UUID
            mihpayid,
            hash: receivedHash,
            key,
        } = data

        const supabase = createClient(
            Deno.env.get("SUPABASE_URL")!,
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
        )

        // Setup Salt
        const IS_TEST = Deno.env.get("PAYU_TEST_MODE") === "true"
        let PAYU_SALT = IS_TEST
            ? (Deno.env.get("PAYU_TEST_SALT") || Deno.env.get("PAYU_SALT"))
            : (Deno.env.get("PAYU_LIVE_SALT") || Deno.env.get("PAYU_SALT"))

        // Fetch booking to verify info
        let bookingId = udf1
        const { data: booking } = await supabase
            .from("bookings")
            .select("email, name, total_amount")
            .eq("id", bookingId)
            .single()

        // Reverse Hash Formula: SHA512(SALT|status|udf10|udf9|...|udf1|email|firstname|productinfo|amount|txnid|key)
        // Since we only used udf1, we need 9 empty pipes before udf1.
        // Actually, the standard PayU reverse hash is: 
        // SALT|status||||||||||udf1|email|firstname|productinfo|amount|txnid|key

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

        // Redirect with booking_id parameter
        const framerBase = "https://twn2.framer.website"
        const targetPage = isSuccess ? "success" : "payment-failed"
        const redirectUrl = `${framerBase}/${targetPage}?booking_id=${bookingId}`

        console.log(`🚀 Redirecting to: ${redirectUrl}`)
        return Response.redirect(redirectUrl, 303)

    } catch (err) {
        console.error("💥 Handle Payment Error:", err)
        return new Response("Internal Server Error", { status: 500 })
    }
})
