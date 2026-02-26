import fs from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { EventSource } from "eventsource";

global.EventSource = EventSource;

const MCP_URL = process.env.MCP_URL || "https://mcp.unframer.co/sse?id=73506ef3a425ea9adf787e19fc7caddc64fe18181bcc24132d988e0397845253&secret=lxsqy1Gm5ZSDmnDuqflUOUhthJg00lBZ";
const SB_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
if (!SB_URL || !SB_KEY) {
  throw new Error("Missing Supabase credentials. Set SUPABASE_URL and SUPABASE_ANON_KEY (or VITE_ equivalents).");
}

function normalizeSlug(v) {
  return String(v || "").trim().toLowerCase();
}
function normalizeText(v) {
  return String(v || "").replace(/\s+/g, " ").trim().toLowerCase();
}
function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function asDateYMD(v) {
  const s = String(v || "").trim();
  if (!s) return "";
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return s;
}

function parseFramerPricingFromFieldData(fieldData) {
  // Try a few common formats we used in CMS imports
  const rows = [];
  if (!fieldData || typeof fieldData !== "object") return rows;

  const candidates = Object.entries(fieldData)
    .filter(([, val]) => val != null)
    .map(([key, val]) => ({ key, val }));

  for (const { key, val } of candidates) {
    if (Array.isArray(val)) {
      for (const item of val) {
        if (item && typeof item === "object") {
          const date = item.start_date || item.date || item.departure_date;
          const variant = item.variant_name || item.variant || item.sharing;
          const transport = item.transport || item.vehicle || item.vehicle_selection || "Seat in Coach";
          const price = toNum(item.price || item.base_price || item.amount);
          if (date && variant && price != null) {
            rows.push({ date: asDateYMD(date), variant: String(variant).trim(), transport: String(transport).trim(), price, sourceField: key });
          }
        }
      }
    } else if (typeof val === "string") {
      const text = val.trim();
      if ((text.startsWith("[") && text.endsWith("]")) || (text.startsWith("{") && text.endsWith("}"))) {
        try {
          const parsed = JSON.parse(text);
          if (Array.isArray(parsed)) {
            for (const item of parsed) {
              if (item && typeof item === "object") {
                const date = item.start_date || item.date || item.departure_date;
                const variant = item.variant_name || item.variant || item.sharing;
                const transport = item.transport || item.vehicle || item.vehicle_selection || "Seat in Coach";
                const price = toNum(item.price || item.base_price || item.amount);
                if (date && variant && price != null) {
                  rows.push({ date: asDateYMD(date), variant: String(variant).trim(), transport: String(transport).trim(), price, sourceField: key });
                }
              }
            }
          }
        } catch {}
      }
    }
  }

  return rows;
}

function keyOf(slug, r) {
  return [normalizeSlug(slug), asDateYMD(r.date), normalizeText(r.variant), normalizeText(r.transport || "Seat in Coach")].join("|");
}

async function sbFetch(path) {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` }
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Supabase ${path} failed ${res.status}: ${text.slice(0, 400)}`);
  return JSON.parse(text);
}

async function getCollections(client) {
  const r = await client.callTool({ name: "getCMSCollections", arguments: {} });
  const t = (r?.content || []).map(c => c?.text || "").join("\n");
  return JSON.parse(t);
}

async function getItems(client, collectionId, limit = 500) {
  const r = await client.callTool({ name: "getCMSItems", arguments: { collectionId, limit } });
  const t = (r?.content || []).map(c => c?.text || "").join("\n");
  const parsed = JSON.parse(t);
  return parsed.items || [];
}

async function main() {
  fs.mkdirSync("/Users/yuvrajsharma/Desktop/Trip-With-Nomads/framer-website/reports", { recursive: true });

  const trips = await sbFetch("trips?select=id,slug,title");
  const pricing = await sbFetch("trip_pricing?select=trip_id,start_date,variant_name,transport,price,early_bird_enabled,early_bird_discount_type,early_bird_discount_value,early_bird_starts_at,early_bird_ends_at");
  const tripById = new Map(trips.map(t => [t.id, t]));

  const sbRows = [];
  for (const p of pricing) {
    const trip = tripById.get(p.trip_id);
    if (!trip) continue;
    sbRows.push({
      slug: trip.slug,
      trip_title: trip.title,
      date: asDateYMD(p.start_date),
      variant: p.variant_name || "",
      transport: p.transport || "Seat in Coach",
      price: toNum(p.price),
      early_bird_enabled: !!p.early_bird_enabled,
      early_bird_discount_type: p.early_bird_discount_type || "",
      early_bird_discount_value: toNum(p.early_bird_discount_value),
      early_bird_starts_at: p.early_bird_starts_at || "",
      early_bird_ends_at: p.early_bird_ends_at || ""
    });
  }

  const sbMap = new Map();
  for (const r of sbRows) sbMap.set(keyOf(r.slug, r), r);

  const transport = new SSEClientTransport(new URL(MCP_URL));
  const client = new Client({ name: "pricing-audit", version: "1.0.0" }, { capabilities: {} });

  await client.connect(transport);
  let collections;
  try {
    collections = await getCollections(client);
  } finally {
    // continue below
  }

  const allCollections = collections.collections || collections || [];
  // pick likely trip collection(s)
  const tripCollections = allCollections.filter(c => /trip/i.test(String(c.name || "")));

  const framerTripRows = [];
  const fieldPresence = [];

  for (const col of tripCollections) {
    const items = await getItems(client, col.id, 1000).catch(() => []);
    for (const item of items) {
      const fd = item.fieldData || {};
      const slug = item.slug || fd.slug || "";
      const title = fd.title || fd.name || fd.edpZYc3f0 || "";
      const parsedPricing = parseFramerPricingFromFieldData(fd);

      fieldPresence.push({
        collection: col.name,
        collection_id: col.id,
        item_slug: slug,
        item_title: title,
        pricing_rows_detected: parsedPricing.length,
        field_keys: Object.keys(fd).join("|")
      });

      for (const r of parsedPricing) {
        framerTripRows.push({
          slug,
          trip_title: title,
          date: r.date,
          variant: r.variant,
          transport: r.transport,
          price: r.price,
          sourceField: r.sourceField,
        });
      }
    }
  }

  await client.close();

  const frMap = new Map();
  for (const r of framerTripRows) frMap.set(keyOf(r.slug, r), r);

  const mismatches = [];
  const onlySupabase = [];
  const onlyFramer = [];

  for (const [k, s] of sbMap.entries()) {
    const f = frMap.get(k);
    if (!f) {
      onlySupabase.push({ key: k, ...s });
      continue;
    }
    if (toNum(s.price) !== toNum(f.price)) {
      mismatches.push({ key: k, slug: s.slug, date: s.date, variant: s.variant, transport: s.transport, supabase_price: s.price, framer_price: f.price });
    }
  }

  for (const [k, f] of frMap.entries()) {
    if (!sbMap.has(k)) onlyFramer.push({ key: k, ...f });
  }

  const summary = {
    timestamp: new Date().toISOString(),
    supabase_rows: sbRows.length,
    framer_rows_detected: framerTripRows.length,
    exact_price_mismatches: mismatches.length,
    only_in_supabase: onlySupabase.length,
    only_in_framer: onlyFramer.length,
    trip_collections_checked: tripCollections.map(c => ({ id: c.id, name: c.name })),
  };

  const outDir = "/Users/yuvrajsharma/Desktop/Trip-With-Nomads/framer-website/reports";
  fs.writeFileSync(`${outDir}/pricing_parity_summary.json`, JSON.stringify(summary, null, 2));
  fs.writeFileSync(`${outDir}/pricing_parity_mismatches.json`, JSON.stringify(mismatches, null, 2));
  fs.writeFileSync(`${outDir}/pricing_only_in_supabase.json`, JSON.stringify(onlySupabase, null, 2));
  fs.writeFileSync(`${outDir}/pricing_only_in_framer.json`, JSON.stringify(onlyFramer, null, 2));
  fs.writeFileSync(`${outDir}/framer_field_presence.json`, JSON.stringify(fieldPresence, null, 2));

  const csv = [
    "type,slug,date,variant,transport,supabase_price,framer_price,key",
    ...mismatches.map(r => ["price_mismatch", r.slug, r.date, JSON.stringify(r.variant), JSON.stringify(r.transport), r.supabase_price, r.framer_price, JSON.stringify(r.key)].join(",")),
    ...onlySupabase.map(r => ["only_supabase", r.slug, r.date, JSON.stringify(r.variant), JSON.stringify(r.transport), r.price ?? "", "", JSON.stringify(r.key)].join(",")),
    ...onlyFramer.map(r => ["only_framer", r.slug, r.date, JSON.stringify(r.variant), JSON.stringify(r.transport), "", r.price ?? "", JSON.stringify(r.key)].join(",")),
  ].join("\n");
  fs.writeFileSync(`${outDir}/pricing_parity_report.csv`, csv);

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((e) => {
  console.error(e?.stack || e?.message || String(e));
  process.exit(1);
});
