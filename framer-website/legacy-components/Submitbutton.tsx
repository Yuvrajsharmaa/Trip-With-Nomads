import { ComponentType } from "react"
import { createBooking } from "./supabase.tsx"
import { store } from "./store.tsx"

export function SubmitBooking(Component: ComponentType): ComponentType {
    return (props: any) => {
        const handleSubmit = async () => {
            console.log("🚀 Submit Button Triggered!")

            // 1. Validate Store Data
            const { trip_id, departure_date, transport, sharing, amount } = store.formData

            // 2. Grab User Details from DOM
            // 2. Grab User Details from DOM - AGGRESSIVE SEARCH
            const inputs = Array.from(document.querySelectorAll("input"))
            console.log("🔍 Found Inputs:", inputs)

            const name = inputs.find(i =>
                i.name === "name" ||
                i.placeholder?.toLowerCase().includes("name") ||
                i.id?.toLowerCase().includes("name")
            )?.value

            const email = inputs.find(i =>
                i.name === "email" ||
                i.type === "email" ||
                i.placeholder?.toLowerCase().includes("email")
            )?.value

            const phone = inputs.find(i =>
                i.name === "phone" ||
                i.type === "tel" ||
                i.placeholder?.toLowerCase().includes("phone")
            )?.value

            console.log("📝 Collected Data:", { name, email, phone, trip_id })

            if (!name || !email) {
                alert("Please fill in your Name and Email.")
                return
            }

            const payload = {
                trip_id,
                departure_date,
                transport,
                sharing,
                name,
                email,
                phone,
                amount
            }

            // 3. Send to Supabase
            // Disable button feedback? We could add a loading state here if needed
            const { data, error } = await createBooking(payload)

            if (error) {
                console.error("❌ Booking Failed:", error)
                alert("Booking failed! " + (error.message || "Unknown error"))
                return
            }

            console.log("✅ Booking Created:", data)

            // 4. Redirect to PayU
            if (data.payu) {
                console.log("💸 Redirecting to PayU...", data.payu)

                // Create a temporary form
                const form = document.createElement("form")
                form.method = "POST"
                form.action = data.payu.action
                form.style.display = "none" // Hidden

                // Add all parameters as hidden inputs
                const params = {
                    key: data.payu.key,
                    txnid: data.payu.txnid,
                    amount: data.payu.amount,
                    productinfo: data.payu.productinfo,
                    firstname: data.payu.firstname,
                    email: data.payu.email,
                    phone: data.payu.phone,
                    surl: data.payu.surl,
                    furl: data.payu.furl,
                    hash: data.payu.hash,
                    udf1: data.payu.udf1
                }

                for (const [key, value] of Object.entries(params)) {
                    const input = document.createElement("input")
                    input.type = "hidden"
                    input.name = key
                    input.value = String(value)
                    form.appendChild(input)
                }

                document.body.appendChild(form)
                form.submit()
            } else {
                alert("Booking saved, but Payment details were missing.")
            }
        }

        // Pass BOTH onTap and onClick to be sure we catch the event
        return <Component {...props} onTap={handleSubmit} onClick={handleSubmit} />
    }
}
