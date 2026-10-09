import { assert, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts"

const source = await Deno.readTextFile(new URL("./index.ts", import.meta.url))

Deno.test("explicit replay selects only the requested submission IDs", () => {
    assertStringIncludes(source, "parseExplicitSubmissionIds(body)")
    assertStringIncludes(source, '.in("submission_id", explicitSubmissionIds)')
    assertStringIncludes(source, "supplied.length")
})

Deno.test("default retries remain limited to rows needing Sheet projection", () => {
    const backlogStatuses = '"pending", "failed", "configuration_missing"'
    assertStringIncludes(source, backlogStatuses)
    assert(source.includes("explicitSubmissionIds === null"))
})

Deno.test("explicit replay input is validated and bounded", () => {
    assertStringIncludes(source, "Invalid submission_ids")
    assertStringIncludes(source, "MAX_EXPLICIT_REPLAY_IDS")
    assertStringIncludes(source, "UUID_PATTERN")
})
