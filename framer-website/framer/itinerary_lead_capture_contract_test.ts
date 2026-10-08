import { assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts"

async function read(name: string): Promise<string> {
    return await Deno.readTextFile(new URL(`./${name}`, import.meta.url))
}

Deno.test("trip itinerary downloads use the existing lead flow and remain idempotent", async () => {
    const source = await read("EmailPopupOverride.tsx")

    assertStringIncludes(source, "withTripItineraryDownloadTracking")
    assertStringIncludes(source, "withTripItineraryFormTracking")
    assertStringIncludes(source, 'trip_itinerary_download')
    assertStringIncludes(source, 'Downloaded itinerary')
    assertStringIncludes(source, "itinerary_name")
    assertStringIncludes(source, "activity_type")
    assertStringIncludes(source, "activity_label")
    assertStringIncludes(source, '"Downloaded itinerary"')
    assertStringIncludes(source, '"Started itinerary request"')
    assertStringIncludes(source, '":download"')
    assertStringIncludes(source, '":partial"')
    assertStringIncludes(source, "submission_id")
    assertStringIncludes(source, "onSubmit={undefined}")
})

Deno.test("record-lead hashes a stable submission payload without request timestamps", async () => {
    const source = await Deno.readTextFile(
        new URL("../supabase/functions/record-lead/index.ts", import.meta.url),
    )

    assertStringIncludes(source, "const hashPayload: Record<string, any> = { ...submissionPayload }")
    assertStringIncludes(source, "delete hashPayload.captured_at")
    assertStringIncludes(source, "payloadHash(hashPayload)")
})
