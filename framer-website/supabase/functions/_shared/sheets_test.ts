import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts"
import { isSheetAlreadyExistsError } from "./sheets.ts"

Deno.test("recognizes a Sheets addSheet race as recoverable", () => {
    assertEquals(
        isSheetAlreadyExistsError(`Sheet tab create failed: 400 {
  "error": {
    "code": 400,
    "message": "Invalid requests[0].addSheet: A sheet with the name \\"Bookings\\" already exists. Please enter another name.",
    "status": "INVALID_ARGUMENT"
  }
}`),
        true,
    )
})

Deno.test("does not hide unrelated Sheets creation errors", () => {
    assertEquals(
        isSheetAlreadyExistsError("Sheet tab create failed: 403 permission denied"),
        false,
    )
})
