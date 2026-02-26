import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import XLSX from 'xlsx';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { EventSource } from 'eventsource';

global.EventSource = EventSource;

const APPLY = process.env.APPLY === '1';
const SKIP_FRAMER = process.env.SKIP_FRAMER === '1';
const SHEET_PATH = '/Users/yuvrajsharma/Downloads/Nomads Early Bird Summer Sale.xlsx';
const OUT_DIR = '/Users/yuvrajsharma/Desktop/Trip-With-Nomads/framer-website/reports/sale_sync';

const MCP_URL = 'https://mcp.unframer.co/sse?id=73506ef3a425ea9adf787e19fc7caddc64fe18181bcc24132d988e0397845253&secret=lxsqy1Gm5ZSDmnDuqflUOUhthJg00lBZ';
const FRAMER_TRIPS_COLLECTION_ID = 'Z1Bphf6oI';

const SB_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
if (!SB_URL || !SB_KEY) {
  throw new Error("Missing Supabase credentials. Set SUPABASE_URL and SUPABASE_ANON_KEY (or VITE_ equivalents).");
}

const KEEP_EXTRA_SLUGS = new Set(['baku-without-shahdag', 'baku-with-shahdag']);

const SHEET_TRIP_MAP = {
  'Summer Spiti with Chandrataal (6N7D)': { slug: 'summer-spiti', title: 'Summer Spiti' },
  '4x4 Summer Spiti Expedition (6N7D)': { slug: '4x4-summer-spiti-expedition-6n7d', title: '4x4 Summer Spiti Expedition (6N7D)' },
  'Spiti Biking': { slug: 'spiti-biking', title: 'Spiti Biking' },
  'Manali with Chandrataal (Delhi-Delhi)': { slug: 'manali-with-chandrataal-delhi-delhi', title: 'Manali with Chandrataal (Delhi-Delhi)' },
  'Teen Taal (Delhi-Delhi)': { slug: 'teen-taal', title: 'Teen Taal (Delhi-Delhi)' },
  'Teen Taal with Gombo Ranjan': { slug: 'teen-taal-with-gombo-ranjan', title: 'Teen Taal with Gombo Ranjan' },
  'Zanskar Valley 6N7D - Tempo Traveller': { slug: 'zanskar-valley-6n7d-tempo-traveller', title: 'Zanskar Valley 6N7D - Tempo Traveller' },
  'Kedarnath Yatra 3N4D - Normal Package': { slug: 'kedarnath-yatra', title: 'Kedarnath Yatra 3N4D - Normal Package' },
  'Leh-Leh with Turtuk 5N6D': { slug: 'ladakh-leh-to-leh-with-turtuk', title: 'Leh-Leh with Turtuk 5N6D' },
  'Leh-Leh with Turtuk 6N7D': { slug: 'leh-leh-with-turtuk-6n7d', title: 'Leh-Leh with Turtuk 6N7D' },
  'Ladakh - Hanle & Umling La - 7N8D': { slug: 'leh-to-leh-with-umling-la-hanle-tso-moriri', title: 'Ladakh - Hanle & Umling La - 7N8D' },
  'Winter Spiti Expedition 6N7D': { slug: 'winter-spiti-expedition', title: 'Winter Spiti Expedition 6N7D' },
  'Spiti Valley with Sangla Holi 6N7D': { slug: 'spiti-valley-with-sangla-holi', title: 'Spiti Valley with Sangla Holi 6N7D' },
  'Sangla Holi 3N4D': { slug: 'sangla-holi-special', title: 'Sangla Holi 3N4D' },
  'Ladakh Apricot Blossom 6N7D - TRIPLE SHARING': { slug: 'ladakh-apricot-blossom', title: 'Ladakh Apricot Blossom 6N7D - TRIPLE SHARING' },
};

const SLUG_ALIASES = {
  'manali-with-chandrataal-2n': 'manali-with-chandrataal-delhi-delhi',
  'teen-taal-with-gopuranjan-4n': 'teen-taal-with-gombo-ranjan',
  'zanskar-6n': 'zanskar-valley-6n7d-tempo-traveller',
  'do-dhaam': 'kedarnath-yatra',
  'leh-to-leh-with-turtuk-5n': 'ladakh-leh-to-leh-with-turtuk',
  'leh-to-leh-with-turtuk-6n': 'leh-leh-with-turtuk-6n7d',
};

function nowStamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function normalizeText(v) {
  return String(v || '').replace(/\s+/g, ' ').trim();
}

function normalizeVariantName(raw) {
  let v = normalizeText(raw);
  if (!v) return '';

  const lower = v.toLowerCase();
  if (lower === 'quad') return 'Quad Sharing';
  if (lower === 'triple') return 'Triple Sharing';
  if (lower === 'double') return 'Double Sharing';

  v = v.replace(/\bseat\s+in\s+couch\b/ig, 'Seat in Coach');
  v = v.replace(/\bsit\s+on\s+coach\b/ig, 'Seat in Coach');
  v = v.replace(/\bsic\b/ig, 'SIC');
  v = v.replace(/\bre\s*himalayan\b/ig, 'RE Himalayan');
  v = v.replace(/\bRE HImalayan\b/ig, 'RE Himalayan');
  v = v.replace(/\bRE HIMALAYAN\b/ig, 'RE Himalayan');
  v = v.replace(/\bSeat In Coach\b/ig, 'Seat in Coach');

  // Only normalize bare sharing labels; do not rewrite words inside rich variant names.
  if (/^\s*triple\s*$/i.test(v)) v = 'Triple Sharing';
  if (/^\s*double\s*$/i.test(v)) v = 'Double Sharing';
  if (/^\s*quad\s*$/i.test(v)) v = 'Quad Sharing';

  return normalizeText(v);
}

function parseSaleSheet(filePath) {
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: null, raw: false });

  const trips = [];
  let currentTrip = null;
  let currentTransport = null;

  const priceCol = 'Trips with discount Prices for Nomads Early Bird Summer Sale';
  const discountCol = '__EMPTY_2';

  for (const row of rows) {
    const sr = Number(row.__EMPTY);
    const c1 = normalizeText(row.__EMPTY_1);
    const priceRaw = normalizeText(row[priceCol]);
    const discountRaw = normalizeText(row[discountCol]);

    if (Number.isFinite(sr) && sr > 0 && c1 && SHEET_TRIP_MAP[c1]) {
      currentTrip = {
        sourceName: c1,
        slug: SHEET_TRIP_MAP[c1].slug,
        title: SHEET_TRIP_MAP[c1].title,
        variants: [],
      };
      currentTransport = null;
      trips.push(currentTrip);
      continue;
    }

    if (!currentTrip) continue;

    const nPrice = Number(priceRaw);
    const nDiscount = Number(discountRaw);

    const looksTransport = !c1 && priceRaw && discountRaw && priceRaw.toLowerCase() === discountRaw.toLowerCase() && Number.isNaN(nPrice) && Number.isNaN(nDiscount);
    if (looksTransport) {
      currentTransport = priceRaw;
      continue;
    }

    if (c1 && Number.isFinite(nPrice) && nPrice > 0 && Number.isFinite(nDiscount) && nDiscount > 0) {
      currentTrip.variants.push({
        variant: normalizeVariantName(c1),
        transport: normalizeText(currentTransport || ''),
        originalPrice: nPrice,
        discountedPrice: nDiscount,
      });
    }
  }

  // keep only known mapped and de-dupe variants by name+transport (first wins)
  for (const t of trips) {
    const seen = new Set();
    t.variants = t.variants.filter((v) => {
      const key = `${v.variant.toLowerCase()}|${v.transport.toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  return trips;
}

async function sb(path, opts = {}) {
  const method = opts.method || 'GET';
  const headers = {
    apikey: SB_KEY,
    Authorization: `Bearer ${SB_KEY}`,
    'Content-Type': 'application/json',
    ...opts.headers,
  };
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
    method,
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  if (!res.ok) {
    throw new Error(`SB ${method} ${path} -> ${res.status} ${text.slice(0, 500)}`);
  }
  return json;
}

function getTripBySlugOrAlias(trips, slug) {
  const exact = trips.find((t) => t.slug === slug);
  if (exact) return exact;
  const aliasSlug = Object.keys(SLUG_ALIASES).find((k) => SLUG_ALIASES[k] === slug);
  if (!aliasSlug) return null;
  return trips.find((t) => t.slug === aliasSlug) || null;
}

async function framerGetTrips() {
    const transport = new SSEClientTransport(new URL(MCP_URL));
    const client = new Client({ name: 'sale-sync', version: '1.0.0' }, { capabilities: {} });
    await client.connect(transport);
    try {
    for (let attempt = 1; attempt <= 4; attempt++) {
      const r = await client.callTool({
        name: 'getCMSItems',
        arguments: { collectionId: FRAMER_TRIPS_COLLECTION_ID, limit: 500 },
      });
      const txt = (r.content || []).map((c) => c.text || '').join('\n');
      if (txt.trim().startsWith('Encountered an error')) {
        if (attempt === 4) {
          throw new Error(`Framer getCMSItems failed after retries: ${txt}`);
        }
        await new Promise((resolve) => setTimeout(resolve, 1500 * attempt));
        continue;
      }
      const parsed = JSON.parse(txt);
      return { client, items: parsed.items || [] };
    }
    throw new Error('Framer getCMSItems retry loop exhausted');
  } catch (e) {
    await client.close();
    throw e;
  }
}

function extractField(v) {
  return (v && typeof v === 'object' && 'value' in v) ? v.value : v;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const stamp = nowStamp();

  const sheetTrips = parseSaleSheet(SHEET_PATH);
  const allowedSlugs = new Set([...sheetTrips.map((t) => t.slug), ...KEEP_EXTRA_SLUGS]);

  // Supabase snapshot
  const [sbTrips, sbPricing] = await Promise.all([
    sb('trips?select=*'),
    sb('trip_pricing?select=*'),
  ]);
  fs.writeFileSync(path.join(OUT_DIR, `${stamp}_supabase_trips_before.json`), JSON.stringify(sbTrips, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, `${stamp}_supabase_pricing_before.json`), JSON.stringify(sbPricing, null, 2));

  // Framer snapshot
  let client = null;
  let framerItems = [];
  if (!SKIP_FRAMER) {
    const fr = await framerGetTrips();
    client = fr.client;
    framerItems = fr.items;
    fs.writeFileSync(path.join(OUT_DIR, `${stamp}_framer_trips_before.json`), JSON.stringify(framerItems, null, 2));
  }

  const actions = {
    createSupabaseTrips: [],
    updateSupabaseTrips: [],
    createSupabasePricing: [],
    updateSupabasePricing: [],
    deleteSupabasePricing: [],
    deleteSupabaseTrips: [],
    moveFramerToDraft: [],
    updateFramerItems: [],
    createFramerItems: [],
    errors: [],
  };

  let liveTrips = [...sbTrips];
  let livePricing = [...sbPricing];

  // Ensure both baku trips exist in Supabase
  const ensureBaku = [
    { slug: 'baku-without-shahdag', title: 'Baku without Shahdag' },
    { slug: 'baku-with-shahdag', title: 'Baku with Shahdag' },
  ];

  for (const b of ensureBaku) {
    let t = liveTrips.find((x) => x.slug === b.slug);
    if (!t) {
      const existing = liveTrips.find((x) => (x.title || '').toLowerCase() === b.title.toLowerCase());
      if (existing) {
        actions.updateSupabaseTrips.push({ id: existing.id, patch: { slug: b.slug, title: b.title, active: true } });
        existing.slug = b.slug;
        existing.title = b.title;
        existing.active = true;
      } else {
        actions.createSupabaseTrips.push({ id: crypto.randomUUID(), slug: b.slug, title: b.title, active: true });
      }
    }
  }

  // APPLY create/update baku first if needed so IDs are available
  if (APPLY) {
    for (const a of actions.createSupabaseTrips) {
      const created = await sb('trips', { method: 'POST', headers: { Prefer: 'return=representation' }, body: a });
      if (Array.isArray(created) && created[0]) liveTrips.push(created[0]);
    }
    for (const a of actions.updateSupabaseTrips) {
      const updated = await sb(`trips?id=eq.${a.id}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: a.patch });
      if (Array.isArray(updated) && updated[0]) {
        const idx = liveTrips.findIndex((t) => t.id === a.id);
        if (idx >= 0) liveTrips[idx] = updated[0];
      }
    }
    actions.createSupabaseTrips = [];
    actions.updateSupabaseTrips = [];
  }

  // Split baku pricing by variant into two trip_ids when currently co-mingled
  const bakuWithout = liveTrips.find((t) => t.slug === 'baku-without-shahdag');
  const bakuWith = liveTrips.find((t) => t.slug === 'baku-with-shahdag');
  if (bakuWithout && bakuWith) {
    for (const row of livePricing.filter((r) => r.trip_id === bakuWithout.id)) {
      const v = normalizeText(row.variant_name).toLowerCase();
      if (v.includes('with shahdag') && bakuWith.id !== bakuWithout.id) {
        actions.updateSupabasePricing.push({ id: row.id, patch: { trip_id: bakuWith.id } });
      }
    }
  }

  // Build canonical trip objects from sheet slugs
  const canonicalTrips = [];
  for (const t of sheetTrips) {
    let found = getTripBySlugOrAlias(liveTrips, t.slug);
    if (!found) {
      actions.createSupabaseTrips.push({ id: crypto.randomUUID(), slug: t.slug, title: t.title, active: true });
      found = { id: null, slug: t.slug, title: t.title, active: true };
    } else if (found.slug !== t.slug || found.title !== t.title || found.active !== true) {
      actions.updateSupabaseTrips.push({ id: found.id, patch: { slug: t.slug, title: t.title, active: true } });
    }
    canonicalTrips.push({ ...t, trip: found });
  }

  if (APPLY) {
    for (const a of actions.createSupabaseTrips) {
      const created = await sb('trips', { method: 'POST', headers: { Prefer: 'return=representation' }, body: a });
      if (Array.isArray(created) && created[0]) liveTrips.push(created[0]);
    }
    for (const a of actions.updateSupabaseTrips) {
      const updated = await sb(`trips?id=eq.${a.id}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: a.patch });
      if (Array.isArray(updated) && updated[0]) {
        const idx = liveTrips.findIndex((t) => t.id === a.id);
        if (idx >= 0) liveTrips[idx] = updated[0];
      }
    }
    actions.createSupabaseTrips = [];
    actions.updateSupabaseTrips = [];
  }

  // refresh canonical trip ids
  for (const c of canonicalTrips) {
    c.trip = liveTrips.find((t) => t.slug === c.slug) || c.trip;
  }

  // apply staged pricing trip_id updates (baku split)
  if (APPLY && actions.updateSupabasePricing.length) {
    for (const a of actions.updateSupabasePricing) {
      await sb(`trip_pricing?id=eq.${a.id}`, { method: 'PATCH', body: a.patch });
    }
    livePricing = await sb('trip_pricing?select=*');
    actions.updateSupabasePricing = [];
  }

  // ensure pricing completeness per sheet trip (for all dates currently present for trip)
  const byTripPricing = new Map();
  for (const row of livePricing) {
    if (!byTripPricing.has(row.trip_id)) byTripPricing.set(row.trip_id, []);
    byTripPricing.get(row.trip_id).push(row);
  }

  for (const c of canonicalTrips) {
    const tripId = c.trip?.id;
    if (!tripId) {
      actions.errors.push(`Missing trip id for ${c.slug}`);
      continue;
    }

    const rows = byTripPricing.get(tripId) || [];
    const dates = [...new Set(rows.map((r) => r.start_date).filter(Boolean))];
    if (!dates.length) {
      // fallback: use at least one date, 30 days from now
      const d = new Date(); d.setDate(d.getDate() + 30);
      dates.push(d.toISOString().slice(0, 10));
    }

    // remove empty/invalid rows for this trip
    for (const r of rows) {
      const invalid = !r.start_date || !r.variant_name || Number(r.price) <= 0;
      if (invalid) actions.deleteSupabasePricing.push(r.id);
    }

    const rowMap = new Map(
      rows.map((r) => {
        const variantKey = normalizeText(r.sharing || r.variant_name).toLowerCase();
        const vehicleKey = normalizeText(r.vehicle || r.transport || '').toLowerCase();
        return [`${r.start_date}|${variantKey}|${vehicleKey}`, r];
      })
    );

    for (const date of dates) {
      for (const v of c.variants) {
        const key = `${date}|${normalizeText(v.variant).toLowerCase()}|${normalizeText(v.transport || '').toLowerCase()}`;
        const existing = rowMap.get(key);
        const discount = Math.max(0, Number(v.originalPrice) - Number(v.discountedPrice));
        const patch = {
          trip_id: tripId,
          start_date: date,
          variant_name: v.variant,
          sharing: v.variant,
          vehicle: normalizeText(v.transport || '') || null,
          transport: normalizeText(v.transport || '') || null,
          price: Number(v.originalPrice),
          early_bird_enabled: discount > 0,
          early_bird_discount_type: 'flat',
          early_bird_discount_value: discount,
          early_bird_label: 'Early Bird Summer Sale',
        };

        if (!existing) {
          actions.createSupabasePricing.push(patch);
        } else {
          const needs = Number(existing.price) !== Number(v.originalPrice)
            || normalizeText(existing.variant_name) !== normalizeText(v.variant)
            || normalizeText(existing.sharing || '') !== normalizeText(v.variant)
            || normalizeText(existing.vehicle || existing.transport || '') !== normalizeText(v.transport || '')
            || !!existing.early_bird_enabled !== (discount > 0)
            || normalizeText(existing.early_bird_discount_type || '') !== 'flat'
            || Number(existing.early_bird_discount_value || 0) !== discount;
          if (needs) actions.updateSupabasePricing.push({ id: existing.id, patch });
        }
      }
    }
  }

  // delete trips/pricing not allowed
  const allowedTripIds = new Set();
  for (const c of canonicalTrips) if (c.trip?.id) allowedTripIds.add(c.trip.id);
  if (bakuWithout?.id) allowedTripIds.add(bakuWithout.id);
  if (bakuWith?.id) allowedTripIds.add(bakuWith.id);

  for (const r of livePricing) {
    if (!allowedTripIds.has(r.trip_id)) actions.deleteSupabasePricing.push(r.id);
  }
  for (const t of liveTrips) {
    if (!allowedSlugs.has(t.slug || '')) actions.deleteSupabaseTrips.push(t.id);
  }

  // Framer sync
  const frLite = framerItems.map((it) => {
    const fd = it.fieldData || {};
    return {
      id: it.id,
      slug: it.slug || '',
      title: extractField(fd.edpZYc3f0) || '',
      trip_id: extractField(fd.sOpVBzQ8v) || '',
      base_price: extractField(fd.L131_KPPt),
      active: extractField(fd.dkXJnSrLi),
      raw: it,
    };
  });

  const minPriceByTrip = new Map();
  for (const c of canonicalTrips) {
    const prices = c.variants.map((v) => Number(v.discountedPrice)).filter((n) => Number.isFinite(n) && n > 0);
    if (prices.length && c.trip?.id) minPriceByTrip.set(c.trip.id, Math.min(...prices));
  }
  if (bakuWithout?.id) {
    const rows = (byTripPricing.get(bakuWithout.id) || []).filter((r) => Number(r.price) > 0);
    if (rows.length) minPriceByTrip.set(bakuWithout.id, Math.min(...rows.map((r) => Number(r.price))));
  }
  if (bakuWith?.id) {
    const rows = (byTripPricing.get(bakuWith.id) || []).filter((r) => Number(r.price) > 0);
    if (rows.length) minPriceByTrip.set(bakuWith.id, Math.min(...rows.map((r) => Number(r.price))));
  }

  // update or create allowed framer items
  for (const c of canonicalTrips) {
    const tripId = c.trip?.id;
    if (!tripId) continue;
    const basePrice = minPriceByTrip.get(tripId) || null;
    const existing = frLite.find((f) => f.slug === c.slug || f.trip_id === tripId || SLUG_ALIASES[f.slug] === c.slug);
    const fieldData = {
      edpZYc3f0: { type: 'string', value: c.title },
      sOpVBzQ8v: { type: 'string', value: tripId },
      ...(basePrice ? { L131_KPPt: { type: 'number', value: Number(basePrice) } } : {}),
      dkXJnSrLi: { type: 'boolean', value: true },
    };

    if (!existing) {
      actions.createFramerItems.push({ slug: c.slug, fieldData });
    } else {
      const needs = existing.slug !== c.slug
        || normalizeText(existing.title) !== normalizeText(c.title)
        || existing.trip_id !== tripId
        || Number(existing.base_price || 0) !== Number(basePrice || 0)
        || existing.active !== true;
      if (needs) actions.updateFramerItems.push({ itemId: existing.id, slug: c.slug, fieldData });
    }
  }

  // ensure baku items exist and separated
  const bakuTargets = [
    { slug: 'baku-without-shahdag', title: 'Baku without Shahdag', trip_id: bakuWithout?.id },
    { slug: 'baku-with-shahdag', title: 'Baku with Shahdag', trip_id: bakuWith?.id },
  ];
  for (const b of bakuTargets) {
    if (!b.trip_id) continue;
    const basePrice = minPriceByTrip.get(b.trip_id) || null;
    const existing = frLite.find((f) => f.slug === b.slug || f.trip_id === b.trip_id);
    const fieldData = {
      edpZYc3f0: { type: 'string', value: b.title },
      sOpVBzQ8v: { type: 'string', value: b.trip_id },
      ...(basePrice ? { L131_KPPt: { type: 'number', value: Number(basePrice) } } : {}),
      dkXJnSrLi: { type: 'boolean', value: true },
    };
    if (!existing) actions.createFramerItems.push({ slug: b.slug, fieldData });
    else {
      const needs = existing.slug !== b.slug || existing.trip_id !== b.trip_id || normalizeText(existing.title) !== normalizeText(b.title);
      if (needs) actions.updateFramerItems.push({ itemId: existing.id, slug: b.slug, fieldData });
    }
  }

  // move non-allowed framer items to draft (active=false)
  for (const f of frLite) {
    if (!allowedSlugs.has(f.slug)) {
      actions.moveFramerToDraft.push({ itemId: f.id, slug: f.slug, title: f.title, fieldData: { dkXJnSrLi: { type: 'boolean', value: false } } });
    }
  }

  // dedupe delete lists
  actions.deleteSupabasePricing = [...new Set(actions.deleteSupabasePricing)];
  actions.deleteSupabaseTrips = [...new Set(actions.deleteSupabaseTrips)];

  // APPLY all
  if (APPLY) {
    for (const a of actions.deleteSupabasePricing) {
      await sb(`trip_pricing?id=eq.${a}`, { method: 'DELETE' });
    }
    for (const a of actions.createSupabasePricing) {
      await sb('trip_pricing', { method: 'POST', headers: { Prefer: 'return=representation' }, body: a });
    }
    for (const a of actions.updateSupabasePricing) {
      await sb(`trip_pricing?id=eq.${a.id}`, { method: 'PATCH', body: a.patch });
    }

    // delete disallowed trips after pricing removed
    for (const id of actions.deleteSupabaseTrips) {
      await sb(`trips?id=eq.${id}`, { method: 'DELETE' });
    }

    if (!SKIP_FRAMER) {
      for (const a of actions.updateFramerItems) {
        await client.callTool({
          name: 'upsertCMSItem',
          arguments: { collectionId: FRAMER_TRIPS_COLLECTION_ID, itemId: a.itemId, slug: a.slug, fieldData: a.fieldData },
        });
      }
      for (const a of actions.createFramerItems) {
        await client.callTool({
          name: 'upsertCMSItem',
          arguments: { collectionId: FRAMER_TRIPS_COLLECTION_ID, slug: a.slug, fieldData: a.fieldData },
        });
      }
      for (const a of actions.moveFramerToDraft) {
        await client.callTool({
          name: 'upsertCMSItem',
          arguments: { collectionId: FRAMER_TRIPS_COLLECTION_ID, itemId: a.itemId, fieldData: a.fieldData },
        });
      }
    }
  }

  const summary = {
    apply: APPLY,
    sheetTrips: sheetTrips.length,
    allowedSlugs: [...allowedSlugs],
    actions: {
      createSupabaseTrips: actions.createSupabaseTrips.length,
      updateSupabaseTrips: actions.updateSupabaseTrips.length,
      createSupabasePricing: actions.createSupabasePricing.length,
      updateSupabasePricing: actions.updateSupabasePricing.length,
      deleteSupabasePricing: actions.deleteSupabasePricing.length,
      deleteSupabaseTrips: actions.deleteSupabaseTrips.length,
      updateFramerItems: actions.updateFramerItems.length,
      createFramerItems: actions.createFramerItems.length,
      moveFramerToDraft: actions.moveFramerToDraft.length,
      errors: actions.errors.length,
    },
  };

  fs.writeFileSync(path.join(OUT_DIR, `${stamp}_planned_actions.json`), JSON.stringify(actions, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, `${stamp}_summary.json`), JSON.stringify(summary, null, 2));

  // post-run snapshots if applied
  if (APPLY) {
    const [tripsAfter, pricingAfter] = await Promise.all([
      sb('trips?select=*'),
      sb('trip_pricing?select=*'),
    ]);
    fs.writeFileSync(path.join(OUT_DIR, `${stamp}_supabase_trips_after.json`), JSON.stringify(tripsAfter, null, 2));
    fs.writeFileSync(path.join(OUT_DIR, `${stamp}_supabase_pricing_after.json`), JSON.stringify(pricingAfter, null, 2));

    if (!SKIP_FRAMER && client) {
      const frAfterRes = await client.callTool({ name: 'getCMSItems', arguments: { collectionId: FRAMER_TRIPS_COLLECTION_ID, limit: 500 } });
      const frAfterTxt = (frAfterRes.content || []).map((c) => c.text || '').join('\n');
      fs.writeFileSync(path.join(OUT_DIR, `${stamp}_framer_trips_after.json`), frAfterTxt);
    }
  }

  if (client) await client.close();
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((e) => {
  console.error(e?.stack || e?.message || String(e));
  process.exit(1);
});
