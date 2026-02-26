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

        // Extract Key Fields
        const {
            status,
            txnid,
            amount,
            productinfo,
            firstname,
            email,
            udf1, // This is our Booking UUID
            mihpayid, // PayU's Internal ID
            hash: receivedHash,
            key,
            error_Message
        } = data

        // 1. Fetch Booking Data (To recover params if PayU dropped them)
        let dbEmail = ""
        let dbFirstname = ""
        const dbProductinfo = "Trip Booking"

        const supabase = createClient(
            Deno.env.get("SUPABASE_URL")!,
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
        )

        // Dynamic Key Selection
        const IS_TEST = Deno.env.get("PAYU_TEST_MODE") === "true"
        let PAYU_SALT = Deno.env.get("PAYU_SALT")

        if (IS_TEST) {
            PAYU_SALT = Deno.env.get("PAYU_TEST_KEY") ? Deno.env.get("PAYU_TEST_SALT") : PAYU_SALT
        } else {
            PAYU_SALT = Deno.env.get("PAYU_LIVE_KEY") ? Deno.env.get("PAYU_LIVE_SALT") : PAYU_SALT
        }

        PAYU_SALT = PAYU_SALT || "TEST_SALT"

        if (udf1) {
            const { data: booking, error } = await supabase
                .from("bookings")
                .select("email, name")
                .eq("id", udf1)
                .single()

            if (booking) {
                dbEmail = booking.email
                dbFirstname = booking.name ? booking.name.split(" ")[0] : ""
                console.log(`📦 Recovered from DB: Email=${dbEmail}, Firstname=${dbFirstname}`)
            }
        }

        // 2. Verify Hash
        // Priority: PayU Param -> DB Param -> Empty String
        const safeUdf1 = udf1 || ""
        const safeEmail = email || dbEmail || ""
        const safeFirstname = firstname || dbFirstname || ""
        const safeProductinfo = productinfo || dbProductinfo || ""
        const safeAmount = amount || ""
        const safeTxnid = txnid || ""
        const safeKey = key || ""

        // Reverse Hash Formula: SHA512(SALT|status||||||||||udf1|email|firstname|productinfo|amount|txnid|key)
        // We need 10 pipes between status and udf1 because we used 10 pipes in the request hash (udf2-udf10 empty)
        const hashString = `${PAYU_SALT}|${status}||||||||||${safeUdf1}|${safeEmail}|${safeFirstname}|${safeProductinfo}|${safeAmount}|${safeTxnid}|${safeKey}`

        console.log(`🧮 Params for Hash: amount=${safeAmount}, status=${status}, txnid=${safeTxnid}, udf1=${safeUdf1}`)
        // console.log(`🔐 Salt Used: ...`) // Reduced noise
        console.log(`📝 Hash String (Masked): ${hashString.replace(PAYU_SALT, "SALT").replace(key, "KEY")}`)

        const encoder = new TextEncoder()
        const dataBuffer = encoder.encode(hashString)
        const hashBuffer = await crypto.subtle.digest("SHA-512", dataBuffer)
        const hashArray = Array.from(new Uint8Array(hashBuffer))
        const calculatedHash = hashArray.map(b => b.toString(16).padStart(2, "0")).join("")

        console.log(`🤖 Comparison: Calculated [${calculatedHash}] vs Received [${receivedHash}]`)

        // Check Integrity or if status is failed
        const isValid = calculatedHash === receivedHash
        const isSuccess = status === "success" && isValid

        if (!isValid) console.error("⚠️ HASH MISMATCH! Payment marked as failed.")

        // 2. Update Supabase (Logic Re-use)
        // We already have the supabase client initialized above

        // Need the 'udf1' which contains the UUID
        if (udf1) {
            const updatePayload: any = {
                payment_status: isSuccess ? "paid" : "failed",
                payu_mihpayid: mihpayid || "N/A" // Renamed from razorpay_payment_id
            }
            if (!isSuccess && error_Message) {
                // Optionally log error message if you had a column
            }

            const { error } = await supabase
                .from("bookings")
                .update(updatePayload)
                .eq("id", udf1)

            if (error) console.error("❌ DB Update Failed:", error)
            else console.log("✅ DB Updated:", updatePayload)
        }

        // 3. Redirect User to Framer (GET Request)
        // Adjust these URLs to your actual Framer pages
        const framerSuccess = "https://tripwithnomads.com/success"
        const framerFailure = "https://tripwithnomads.com/failure"

        const targetUrl = isSuccess ? framerSuccess : framerFailure

        return Response.redirect(targetUrl, 303) // 303 See Other enforces GET

    } catch (err) {
        console.error("💥 Handle Payment Error:", err)
        return new Response("Internal Server Error", { status: 500 })
    }
})
