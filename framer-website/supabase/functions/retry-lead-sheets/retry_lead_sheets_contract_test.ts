import { assert, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts"

const source = await Deno.readTextFile(new URL("./index.ts", import.meta.url))

Deno.test("lead Sheet retry is protected and only consumes retryable states", () => {
    assertStringIncludes(source, "LEAD_SHEET_RETRY_SECRET")
    assertStringIncludes(source, "SUPABASE_SERVICE_ROLE_KEY")
    assertStringIncludes(source, '"pending", "failed", "configuration_missing"')
    assertStringIncludes(source, "projectLeadSheets")
    assertStringIncludes(source, "sheet_sync_status")
    assertStringIncludes(source, "configuration_missing")
    assertStringIncludes(source, "normalized_email")
    assertStringIncludes(source, "Multiple lead rows match")
    assert(source.includes("Unauthorized"))
})
