import { assert, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts"

const migration = await Deno.readTextFile(
    new URL("./20261009100000_sheet_projection_locks.sql", import.meta.url),
)
const sheets = await Deno.readTextFile(
    new URL("../functions/_shared/sheets.ts", import.meta.url),
)

Deno.test("Sheet projection locks are private, leased, and service-role only", () => {
    assertStringIncludes(migration, "create table if not exists public.sheet_projection_locks")
    assertStringIncludes(migration, "enable row level security")
    assertStringIncludes(migration, "lease_until <= now()")
    assertStringIncludes(migration, "public.acquire_sheet_projection_lock")
    assertStringIncludes(migration, "public.release_sheet_projection_lock")
    assertStringIncludes(migration, "to service_role")
    assert(!/grant\s+execute[^;]+\bto\s+(anon|authenticated)\b/i.test(migration))
    assertStringIncludes(sheets, 'rpc("acquire_sheet_projection_lock"')
    assertStringIncludes(sheets, 'rpc("release_sheet_projection_lock"')
})
