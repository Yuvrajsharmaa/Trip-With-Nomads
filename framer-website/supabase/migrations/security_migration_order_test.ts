import { assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts"

Deno.test("security migration does not fail before payment_attempts exists", async () => {
    const source = await Deno.readTextFile(
        new URL("./20260309185220_fix_security_vulnerabilities.sql", import.meta.url),
    )

    assertStringIncludes(source, "to_regclass('public.payment_attempts')")
    assertStringIncludes(source, "EXECUTE 'CREATE INDEX IF NOT EXISTS idx_payment_attempts_booking_id")
})
