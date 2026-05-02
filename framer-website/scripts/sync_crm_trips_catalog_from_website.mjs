#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const targetUrl = process.env.CRM_STAGING_SUPABASE_URL || process.env.CRM_PROD_SUPABASE_URL;
const targetKey = process.env.CRM_STAGING_SERVICE_ROLE_KEY || process.env.CRM_PROD_SERVICE_ROLE_KEY;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function inferTripType(text) {
  const value = String(text || "").toLowerCase();
  if (!value) return null;
  if (/(international|europe|bali|vietnam|thailand|turkey|dubai)/.test(value)) {
    return "international";
  }
  return "domestic";
}

async function main() {
  if (!targetUrl || !targetKey) {
    const sql = `
      insert into crm.trips_catalog (slug, title, trip_type, is_active, is_custom)
      select
        lower(trim(slug)) as slug,
        trim(coalesce(title, slug)) as title,
        case
          when lower(coalesce(title, '') || ' ' || coalesce(slug, '')) ~ '(international|europe|bali|vietnam|thailand|turkey|dubai)' then 'international'
          else 'domestic'
        end as trip_type,
        coalesce(active, true) as is_active,
        false as is_custom
      from public.trips
      where slug is not null and btrim(slug) <> ''
      on conflict (slug) do update
      set
        title = excluded.title,
        trip_type = coalesce(crm.trips_catalog.trip_type, excluded.trip_type),
        is_active = excluded.is_active
      where crm.trips_catalog.is_custom = false;
    `;

    execFileSync(
      "supabase",
      ["db", "query", sql, "--linked", "--workdir", path.join(__dirname, "..")],
      { stdio: "inherit" }
    );
    console.log("Synced website trips into crm.trips_catalog via linked staging project.");
    return;
  }

  const supabase = createClient(targetUrl, targetKey, { auth: { persistSession: false } });

  const { data: trips, error } = await supabase
    .from("trips")
    .select("slug,title,active")
    .not("slug", "is", null)
    .order("title", { ascending: true })
    .limit(10000);

  if (error) throw error;

  const rows = (trips || [])
    .filter((trip) => String(trip.slug || "").trim())
    .map((trip) => {
      const slug = String(trip.slug).trim().toLowerCase();
      const title = String(trip.title || slug).trim();
      return {
        slug,
        title,
        trip_type: inferTripType(`${title} ${slug}`),
        is_active: Boolean(trip.active ?? true),
        is_custom: false,
      };
    });

  if (rows.length === 0) {
    console.log("No website trips found to sync.");
    return;
  }

  const { error: upsertError } = await supabase
    .schema("crm")
    .from("trips_catalog")
    .upsert(rows, { onConflict: "slug", ignoreDuplicates: false });

  if (upsertError) throw upsertError;

  console.log(`Synced ${rows.length} website trips into crm.trips_catalog.`);
}

main().catch((err) => {
  console.error("Trip catalog sync failed:", err?.message || err);
  process.exit(1);
});
