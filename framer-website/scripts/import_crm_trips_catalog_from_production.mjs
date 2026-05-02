#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";

const prodUrl = process.env.CRM_PROD_SUPABASE_URL;
const prodKey = process.env.CRM_PROD_SERVICE_ROLE_KEY;
const stagingUrl = process.env.CRM_STAGING_SUPABASE_URL;
const stagingKey = process.env.CRM_STAGING_SERVICE_ROLE_KEY;

if (!prodUrl || !prodKey || !stagingUrl || !stagingKey) {
  console.error("Missing env vars. Required: CRM_PROD_SUPABASE_URL, CRM_PROD_SERVICE_ROLE_KEY, CRM_STAGING_SUPABASE_URL, CRM_STAGING_SERVICE_ROLE_KEY");
  process.exit(1);
}

const prod = createClient(prodUrl, prodKey, { auth: { persistSession: false } });
const staging = createClient(stagingUrl, stagingKey, { auth: { persistSession: false } });

async function main() {
  const { data: trips, error } = await prod
    .from("trips")
    .select("slug,title,active")
    .not("slug", "is", null)
    .order("title", { ascending: true })
    .limit(5000);

  if (error) {
    throw error;
  }

  const rows = (trips || [])
    .filter((trip) => String(trip.slug || "").trim())
    .map((trip) => ({
      slug: String(trip.slug).trim().toLowerCase(),
      title: String(trip.title || trip.slug).trim(),
      trip_type: null,
      is_active: Boolean(trip.active ?? true),
      is_custom: false,
    }));

  if (rows.length === 0) {
    console.log("No trips found in production source table.");
    return;
  }

  const { error: upsertError } = await staging
    .schema("crm")
    .from("trips_catalog")
    .upsert(rows, { onConflict: "slug", ignoreDuplicates: false });

  if (upsertError) {
    throw upsertError;
  }

  console.log(`Imported or updated ${rows.length} trips into crm.trips_catalog.`);
  console.log("trip_type was intentionally left null for manual mapping (domestic/international).");
}

main().catch((err) => {
  console.error("Trip catalog import failed:", err?.message || err);
  process.exit(1);
});
