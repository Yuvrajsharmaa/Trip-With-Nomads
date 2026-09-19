import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts"
import { extractRazorpayCallbackIdentifiers } from "./razorpay_callback.ts"

Deno.test("extracts identifiers from a successful Razorpay callback", () => {
    assertEquals(
        extractRazorpayCallbackIdentifiers({
            razorpay_order_id: "order_success_123",
            razorpay_payment_id: "pay_success_123",
            razorpay_signature: "signature_123",
        }),
        {
            paymentId: "pay_success_123",
            orderId: "order_success_123",
            signature: "signature_123",
            errorCode: "",
            errorDescription: "",
        },
    )
})

Deno.test("extracts identifiers from JSON error metadata", () => {
    assertEquals(
        extractRazorpayCallbackIdentifiers({
            "error[code]": "BAD_REQUEST_ERROR",
            "error[description]": "Payment failed",
            "error[metadata]": JSON.stringify({
                payment_id: "pay_failed_json",
                order_id: "order_failed_json",
            }),
        }),
        {
            paymentId: "pay_failed_json",
            orderId: "order_failed_json",
            signature: "",
            errorCode: "bad_request_error",
            errorDescription: "Payment failed",
        },
    )
})

Deno.test("preserves flattened error metadata compatibility", () => {
    assertEquals(
        extractRazorpayCallbackIdentifiers({
            "error[metadata][payment_id]": "pay_failed_flat",
            "error[metadata][order_id]": "order_failed_flat",
            "error_code": "PAYMENT_FAILED",
            error_description: "Declined by the bank",
        }),
        {
            paymentId: "pay_failed_flat",
            orderId: "order_failed_flat",
            signature: "",
            errorCode: "payment_failed",
            errorDescription: "Declined by the bank",
        },
    )
})

Deno.test("does not throw or invent identifiers for malformed metadata", () => {
    assertEquals(
        extractRazorpayCallbackIdentifiers({
            error: "not-json",
            "error[metadata]": "{not-json",
        }),
        {
            paymentId: "",
            orderId: "",
            signature: "",
            errorCode: "",
            errorDescription: "",
        },
    )
})
