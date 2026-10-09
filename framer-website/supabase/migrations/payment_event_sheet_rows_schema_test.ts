import { assert, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts"

const migration = await Deno.readTextFile(
    new URL("./20261009103000_payment_event_sheet_rows.sql", import.meta.url),
)

Deno.test("payment event Sheet row mappings stay internal and unique per event", () => {
    assertStringIncludes(migration, "public.payment_event_sheet_rows")
    assertStringIncludes(migration, "payment_event_id uuid primary key")
    assertStringIncludes(migration, "references public.payment_events(id) on delete cascade")
    assertStringIncludes(migration, "spreadsheet_id text not null")
    assertStringIncludes(migration, "tab_name text not null")
    assertStringIncludes(migration, "row_number integer not null check (row_number >= 2)")
    assertStringIncludes(migration, "unique (spreadsheet_id, tab_name, row_number)")
    assertStringIncludes(migration, "enable row level security")
    assertStringIncludes(migration, "to service_role")
    assert(
        !/grant\s+all[^;]+\bto\s+(public|anon|authenticated)\b/i.test(migration),
    )
})
