import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts"
import { runIndependentSheetProjections } from "./projection_execution.ts"

Deno.test("master projection still runs when a routed sheet projection fails", async () => {
    let masterAttempted = false
    const result = await runIndependentSheetProjections(
        async () => {
            throw new Error("Trip Page header drift")
        },
        async () => {
            masterAttempted = true
        },
    )

    assertEquals(masterAttempted, true)
    assertEquals(result.sheetLogged, false)
    assertEquals(result.masterLogged, true)
    assertEquals(result.errors, ["Trip Page header drift"])
})
