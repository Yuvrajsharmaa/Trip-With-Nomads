import { assert, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts"

const source = await Deno.readTextFile(new URL("./get-booking-status/index.ts", import.meta.url))

Deno.test("status projection uses provider-neutral transaction fields", () => {
  assertStringIncludes(source, "payment_gateway_txn_id")
  assert(!source.includes("payu_txnid"), "status projection must not depend on retired PayU column")
  assertStringIncludes(source, "cache-control")
})
