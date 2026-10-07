import { assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts"

Deno.test("lead submission migration guarantees legacy and latest UTM columns", async () => {
    const source = await Deno.readTextFile(
        new URL("./20261006100000_lead_submission_idempotency.sql", import.meta.url),
    )

    for (
        const column of [
            "utm_source",
            "utm_medium",
            "utm_campaign",
            "utm_term",
            "utm_content",
            "latest_utm_source",
            "latest_utm_medium",
            "latest_utm_campaign",
            "latest_utm_term",
            "latest_utm_content",
        ]
    ) {
        assertStringIncludes(source, `add column if not exists ${column} text`)
    }
})

Deno.test("lead display migration preserves the latest invite reason", async () => {
    const source = await Deno.readTextFile(
        new URL("./20261007090000_lead_reason_and_sheet_display.sql", import.meta.url),
    )
    assertStringIncludes(source, "add column if not exists latest_reason text")
})
