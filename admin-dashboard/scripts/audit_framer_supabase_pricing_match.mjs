import fs from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { EventSource } from 'eventsource';

global.EventSource = EventSource;

const MCP_URL = 'https://mcp.unframer.co/sse?id=73506ef3a425ea9adf787e19fc7caddc64fe18181bcc24132d988e0397845253&secret=lxsqy1Gm5ZSDmnDuqflUOUhthJg00lBZ';
const COLLECTION_ID = 'Z1Bphf6oI'; // trips
const SB_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
if (!SB_URL || !SB_KEY) {
  throw new Error("Missing Supabase credentials. Set SUPABASE_URL and SUPABASE_ANON_KEY (or VITE_ equivalents).");
}

function extractRaw(v) {
  if (v == null) return null;
  if (typeof v === 'object' && 'value' in v) return v.value;
  return v;
}
function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function norm(v) {
  return String(v || '').trim().toLowerCase();
}

async function sb(path) {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Supabase ${path} ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

async function getFramerTrips() {
  const transport = new SSEClientTransport(new URL(MCP_URL));
  const client = new Client({ name: 'audit-client', version: '1.0.0' }, { capabilities: {} });
  try {
    await client.connect(transport);
    const r = await client.callTool({ name: 'getCMSItems', arguments: { collectionId: COLLECTION_ID, limit: 500 } });
    const txt = (r.content || []).map((c) => c.text || '').join('\n');
    const parsed = JSON.parse(txt);
    return parsed.items || [];
  } finally {
    await client.close();
  }
}

async function main() {
  const outDir = '/Users/yuvrajsharma/Desktop/Trip-With-Nomads/framer-website/reports';
  fs.mkdirSync(outDir, { recursive: true });

  const [trips, pricing, framerItems] = await Promise.all([
    sb('trips?select=id,title,slug,active'),
    sb('trip_pricing?select=trip_id,price,start_date,variant_name&price=gt.0'),
    getFramerTrips(),
  ]);

  const tripById = new Map(trips.map((t) => [t.id, t]));
  const minPriceByTrip = new Map();
  const minPriceRowsByTrip = new Map();
  for (const row of pricing) {
    const price = toNum(row.price);
    if (price == null) continue;
    const existing = minPriceByTrip.get(row.trip_id);
    if (existing == null || price < existing) {
      minPriceByTrip.set(row.trip_id, price);
      minPriceRowsByTrip.set(row.trip_id, [row]);
    } else if (price === existing) {
      minPriceRowsByTrip.get(row.trip_id).push(row);
    }
  }

  const report = [];
  const mismatches = [];
  const missingTripId = [];
  const invalidTripId = [];

  for (const item of framerItems) {
    const fd = item.fieldData || {};
    const title = extractRaw(fd.edpZYc3f0) || '';
    const framerSlug = item.slug || '';
    const framerTripId = extractRaw(fd.sOpVBzQ8v);
    const framerBasePrice = toNum(extractRaw(fd.L131_KPPt));

    const row = {
      framer_item_id: item.id,
      framer_slug: framerSlug,
      framer_title: title,
      framer_trip_id: framerTripId || '',
      framer_base_price: framerBasePrice,
      supabase_trip_title: '',
      supabase_trip_slug: '',
      supabase_min_price: null,
      status: 'ok',
      notes: '',
    };

    if (!framerTripId) {
      row.status = 'missing_trip_id';
      row.notes = 'Framer item has no trip_id field value';
      missingTripId.push(row);
      report.push(row);
      continue;
    }

    const trip = tripById.get(framerTripId);
    if (!trip) {
      row.status = 'invalid_trip_id';
      row.notes = 'trip_id not found in Supabase trips';
      invalidTripId.push(row);
      report.push(row);
      continue;
    }

    row.supabase_trip_title = trip.title || '';
    row.supabase_trip_slug = trip.slug || '';
    row.supabase_min_price = minPriceByTrip.get(framerTripId) ?? null;

    const slugMismatch = norm(framerSlug) && norm(trip.slug) && norm(framerSlug) !== norm(trip.slug);
    const priceMismatch = row.supabase_min_price != null && framerBasePrice != null && Number(row.supabase_min_price) !== Number(framerBasePrice);
    const missingBase = framerBasePrice == null;
    const missingPricing = row.supabase_min_price == null;

    if (slugMismatch || priceMismatch || missingBase || missingPricing) {
      row.status = 'mismatch';
      const notes = [];
      if (slugMismatch) notes.push('slug mismatch');
      if (priceMismatch) notes.push('base_price != supabase min(price)');
      if (missingBase) notes.push('framer base_price missing');
      if (missingPricing) notes.push('no pricing rows in supabase');
      row.notes = notes.join('; ');
      mismatches.push(row);
    }

    report.push(row);
  }

  const summary = {
    timestamp: new Date().toISOString(),
    framer_items: framerItems.length,
    supabase_trips: trips.length,
    supabase_pricing_rows: pricing.length,
    mismatches: mismatches.length,
    missing_trip_id: missingTripId.length,
    invalid_trip_id: invalidTripId.length,
    ok: report.filter((r) => r.status === 'ok').length,
  };

  fs.writeFileSync(`${outDir}/framer_supabase_pricing_parity_summary.json`, JSON.stringify(summary, null, 2));
  fs.writeFileSync(`${outDir}/framer_supabase_pricing_parity_report.json`, JSON.stringify(report, null, 2));
  fs.writeFileSync(`${outDir}/framer_supabase_pricing_mismatches.json`, JSON.stringify(mismatches, null, 2));

  const csvHeader = 'status,framer_item_id,framer_slug,framer_title,framer_trip_id,framer_base_price,supabase_trip_slug,supabase_trip_title,supabase_min_price,notes';
  const csvRows = report.map((r) => [
    r.status,
    r.framer_item_id,
    JSON.stringify(r.framer_slug || ''),
    JSON.stringify(r.framer_title || ''),
    r.framer_trip_id || '',
    r.framer_base_price ?? '',
    JSON.stringify(r.supabase_trip_slug || ''),
    JSON.stringify(r.supabase_trip_title || ''),
    r.supabase_min_price ?? '',
    JSON.stringify(r.notes || ''),
  ].join(','));
  fs.writeFileSync(`${outDir}/framer_supabase_pricing_parity_report.csv`, [csvHeader, ...csvRows].join('\n'));

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((e) => {
  console.error(e?.stack || e?.message || String(e));
  process.exit(1);
});
