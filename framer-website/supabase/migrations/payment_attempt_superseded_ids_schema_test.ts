import { assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts"

Deno.test("retry replay migration adds a backward-compatible superseded payment ID list", async () => {
    const source = await Deno.readTextFile(
        new URL("./20261103100000_payment_attempt_superseded_payment_ids.sql", import.meta.url),
    )

    assertStringIncludes(source, "alter table public.payment_attempts")
    assertStringIncludes(source, "add column if not exists superseded_payment_ids text[]")
    assertStringIncludes(source, "not null default '{}'")
})
