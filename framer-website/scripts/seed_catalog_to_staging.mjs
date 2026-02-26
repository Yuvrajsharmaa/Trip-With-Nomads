import { createClient } from "@supabase/supabase-js";

const SOURCE_SUPABASE_URL = process.env.SOURCE_SUPABASE_URL || process.env.PROD_SUPABASE_URL;
const SOURCE_SUPABASE_SERVICE_ROLE_KEY =
    process.env.SOURCE_SUPABASE_SERVICE_ROLE_KEY || process.env.PROD_SUPABASE_SERVICE_ROLE_KEY;

const TARGET_SUPABASE_URL = process.env.TARGET_SUPABASE_URL || process.env.STAGING_SUPABASE_URL;
const TARGET_SUPABASE_SERVICE_ROLE_KEY =
    process.env.TARGET_SUPABASE_SERVICE_ROLE_KEY || process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY;

if (
    !SOURCE_SUPABASE_URL ||
    !SOURCE_SUPABASE_SERVICE_ROLE_KEY ||
    !TARGET_SUPABASE_URL ||
    !TARGET_SUPABASE_SERVICE_ROLE_KEY
) {
    throw new Error(
        "Missing source/target Supabase credentials. Set SOURCE_* and TARGET_* (or PROD_*/STAGING_* fallbacks)."
    );
}

const source = createClient(SOURCE_SUPABASE_URL, SOURCE_SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
});
const target = createClient(TARGET_SUPABASE_URL, TARGET_SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
});

const TABLES = [
    { name: "trips", select: "*", onConflict: "id" },
    { name: "trip_pricing", select: "*", onConflict: "id" },
    { name: "coupons", select: "*", onConflict: "code" },
];

const READ_BATCH_SIZE = 1000;
const WRITE_BATCH_SIZE = 500;

async function fetchAllRows(tableName, selectClause) {
    const rows = [];
    let from = 0;

    while (true) {
        const to = from + READ_BATCH_SIZE - 1;
        const { data, error } = await source
            .from(tableName)
            .select(selectClause)
            .order("id", { ascending: true })
            .range(from, to);

        if (error) {
            throw new Error(`Failed reading ${tableName}: ${error.message}`);
        }

        const chunk = Array.isArray(data) ? data : [];
        rows.push(...chunk);
        if (chunk.length < READ_BATCH_SIZE) break;
        from += READ_BATCH_SIZE;
    }

    return rows;
}

async function upsertRows(tableName, onConflict, rows) {
    if (!rows.length) {
        console.log(`[seed] ${tableName}: no rows to sync`);
        return;
    }

    for (let i = 0; i < rows.length; i += WRITE_BATCH_SIZE) {
        const batch = rows.slice(i, i + WRITE_BATCH_SIZE);
        const { error } = await target.from(tableName).upsert(batch, { onConflict });
        if (error) {
            throw new Error(
                `Failed upserting ${tableName} rows ${i}-${i + batch.length - 1}: ${error.message}`
            );
        }
    }

    console.log(`[seed] ${tableName}: upserted ${rows.length} row(s)`);
}

async function run() {
    console.log("[seed] source:", SOURCE_SUPABASE_URL);
    console.log("[seed] target:", TARGET_SUPABASE_URL);
    console.log("[seed] tables:", TABLES.map((t) => t.name).join(", "));

    for (const table of TABLES) {
        const rows = await fetchAllRows(table.name, table.select);
        await upsertRows(table.name, table.onConflict, rows);
    }

    console.log("[seed] Catalog sync complete");
}

run().catch((err) => {
    console.error("[seed] Fatal error:", err);
    process.exitCode = 1;
});
