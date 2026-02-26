import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import XLSX from 'xlsx';

const APPLY = process.env.APPLY === '1';

const SB_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
if (!SB_URL || !SB_KEY) {
  throw new Error("Missing Supabase credentials. Set SUPABASE_URL and SUPABASE_ANON_KEY (or VITE_ equivalents).");
}

const ROOT = '/Users/yuvrajsharma/Desktop/Trip-With-Nomads';
const OUT_DIR = path.join(ROOT, 'framer-website/reports/launch_cutover');
const DATE_SOURCE_CSV = path.join(ROOT, 'framer-website/reports/imported_trip_pricing_from_pdfs.csv');

const SHARING_VALUES = ['Quad', 'Triple', 'Double'];
const DOMESTIC = 'domestic';
const INTERNATIONAL = 'international';

const TRIPS = [
  { pdfName: 'Summer Spiti with Chandrataal (6N7D)', slug: 'summer-spiti', title: 'Summer Spiti', type: DOMESTIC },
  { pdfName: '4x4 Summer Spiti Expedition (6N7D)', slug: '4x4-summer-spiti-expedition-6n7d', title: '4x4 Summer Spiti Expedition (6N7D)', type: DOMESTIC },
  { pdfName: 'Spiti Biking', slug: 'spiti-biking', title: 'Spiti Biking', type: DOMESTIC },
  { pdfName: 'Manali with Chandrataal (Delhi-Delhi)', slug: 'manali-with-chandrataal-delhi-delhi', title: 'Manali with Chandrataal (Delhi-Delhi)', type: DOMESTIC },
  { pdfName: 'Teen Taal (Delhi-Delhi)', slug: 'teen-taal', title: 'Teen Taal (Delhi-Delhi)', type: DOMESTIC },
  { pdfName: 'Teen Taal with Gombo Ranjan', slug: 'teen-taal-with-gombo-ranjan', title: 'Teen Taal With Gombo Ranjan', type: DOMESTIC },
  { pdfName: 'Zanskar Valley 6N7D - Tempo Traveller', slug: 'zanskar-valley-6n7d-tempo-traveller', title: 'Zanskar Valley 6N7D (Tempo Traveller)', type: DOMESTIC },
  { pdfName: 'Kedarnath Yatra 3N4D - Normal Package', slug: 'kedarnath-yatra', title: 'Kedarnath Yatra', type: DOMESTIC },
  { pdfName: 'Leh-Leh with Turtuk 5N6D', slug: 'ladakh-leh-to-leh-with-turtuk', title: 'Leh-Leh With Turtuk 5N6D', type: DOMESTIC },
  { pdfName: 'Leh-Leh with Turtuk 6N7D', slug: 'leh-leh-with-turtuk-6n7d', title: 'Leh-Leh with Turtuk 6N7D', type: DOMESTIC },
  { pdfName: 'Ladakh - Hanle & Umling La - 7N8D', slug: 'leh-to-leh-with-umling-la-hanle-tso-moriri', title: 'Leh to Leh with Umling La, Hanle & Tso Moriri', type: DOMESTIC },
  { pdfName: 'Winter Spiti Expedition 6N7D', slug: 'winter-spiti-expedition', title: 'Winter Spiti Expedition', type: DOMESTIC },
  { pdfName: 'Spiti Valley with Sangla Holi 6N7D', slug: 'spiti-valley-with-sangla-holi', title: 'Spiti Valley with sangla holi', type: DOMESTIC },
  { pdfName: 'Sangla Holi 3N4D', slug: 'sangla-holi-special', title: 'Sangla Holi Special', type: DOMESTIC },
  { pdfName: 'Ladakh Apricot Blossom 6N7D - TRIPLE SHARING', slug: 'ladakh-apricot-blossom', title: 'Ladakh Apricot Blossom', type: DOMESTIC },
  { pdfName: 'Bali 8N9D', slug: 'bali-with-nusa-gili-t', title: 'Bali with Nusa & Gili T', type: INTERNATIONAL, fixedPrice: 69999 },
  { pdfName: 'Thailand Songkran Festival', slug: 'thailand-songkran-festival', title: 'Thailand Songkran Festival', type: INTERNATIONAL, fixedPrice: 52999 },
  { pdfName: 'Thailand Full Moon Party', slug: 'thailand-full-moon-party', title: 'Thailand full moon party', type: INTERNATIONAL, fixedPrice: 52999 },
  { pdfName: 'Almaty', slug: 'almaty', title: 'Almaty', type: INTERNATIONAL, fixedPrice: 52999 },
  { pdfName: 'Sri Lanka', slug: 'sri-lanka', title: 'Sri Lanka', type: INTERNATIONAL, fixedPrice: 58499 },
  { pdfName: 'Dubai', slug: 'dubai', title: 'Dubai', type: INTERNATIONAL, fixedPrice: 72499 },
  { pdfName: 'Japan Cherry Blossom', slug: 'japan', title: 'Japan', type: INTERNATIONAL, fixedPrice: 174999 },
];

const DATE_ALIAS = {
  'manali-with-chandrataal-2n': 'manali-with-chandrataal-delhi-delhi',
  'teen-taal-with-gopuranjan-4n': 'teen-taal-with-gombo-ranjan',
  'zanskar-6n': 'zanskar-valley-6n7d-tempo-traveller',
  'leh-to-leh-with-turtuk-5n': 'ladakh-leh-to-leh-with-turtuk',
  'leh-to-leh-with-turtuk-6n': 'leh-leh-with-turtuk-6n7d',
  'do-dhaam': 'kedarnath-yatra',
  'bali-8n9d': 'bali-with-nusa-gili-t',
};

const DATE_FALLBACK_SLUG = {
  '4x4-summer-spiti-expedition-6n7d': 'summer-spiti',
};

const DEFAULT_DATE = '2026-03-01';

const DOMESTIC_VARIANTS = {
  'summer-spiti': [
    { sharing: 'Quad', vehicle: null, base: 17999, sale: 16499 },
    { sharing: 'Triple', vehicle: null, base: 19999, sale: 17499 },
    { sharing: 'Double', vehicle: null, base: 21999, sale: 18999 },
  ],
  '4x4-summer-spiti-expedition-6n7d': [
    { sharing: 'Triple', vehicle: 'SUV - Innova Crysta/Jimny/Thar/Scorpio N', base: 32999, sale: 29999 },
    { sharing: 'Double', vehicle: 'SUV - Innova Crysta/Jimny/Thar/Scorpio N', base: 35999, sale: 31999 },
    { sharing: 'Triple', vehicle: 'Fortuner/Hilux', base: 35999, sale: 32999 },
    { sharing: 'Double', vehicle: 'Fortuner/Hilux', base: 37999, sale: 33999 },
  ],
  'spiti-biking': [
    { sharing: 'Triple', vehicle: 'SIC (Seat in Coach)', base: 23999, sale: 19999 },
    { sharing: 'Triple', vehicle: 'Self Bike', base: 21999, sale: 18999 },
    { sharing: 'Triple', vehicle: 'RE Himalayan (Dual Rider)', base: 30999, sale: 26999 },
    { sharing: 'Triple', vehicle: 'RE Himalayan (Solo Rider)', base: 40999, sale: 36999 },
    { sharing: 'Double', vehicle: 'SIC (Seat in Coach)', base: 26999, sale: 22999 },
    { sharing: 'Double', vehicle: 'Self Bike', base: 24999, sale: 21999 },
    { sharing: 'Double', vehicle: 'RE Himalayan (Dual Rider)', base: 33999, sale: 29999 },
    { sharing: 'Double', vehicle: 'RE Himalayan (Solo Rider)', base: 43999, sale: 39999 },
  ],
  'manali-with-chandrataal-delhi-delhi': [
    { sharing: 'Triple', vehicle: null, base: 11999, sale: 9999 },
    { sharing: 'Double', vehicle: null, base: 12999, sale: 10999 },
  ],
  'teen-taal': [
    { sharing: 'Triple', vehicle: null, base: 15499, sale: 13999 },
    { sharing: 'Double', vehicle: null, base: 16499, sale: 14999 },
  ],
  'teen-taal-with-gombo-ranjan': [
    { sharing: 'Triple', vehicle: null, base: 19000, sale: 15500 },
    { sharing: 'Double', vehicle: null, base: 20000, sale: 16500 },
  ],
  'zanskar-valley-6n7d-tempo-traveller': [
    { sharing: 'Triple', vehicle: null, base: 25999, sale: 23999 },
    { sharing: 'Double', vehicle: null, base: 29999, sale: 27999 },
  ],
  'kedarnath-yatra': [
    { sharing: 'Quad', vehicle: null, base: 11999, sale: 9999 },
    { sharing: 'Triple', vehicle: null, base: 12999, sale: 10999 },
    { sharing: 'Double', vehicle: null, base: 13999, sale: 11999 },
  ],
  'ladakh-leh-to-leh-with-turtuk': [
    { sharing: 'Triple', vehicle: 'SIC (Seat in Coach)', base: 18999, sale: 16999 },
    { sharing: 'Triple', vehicle: 'RE Himalayan (Pillion)', base: 22999, sale: 19999 },
    { sharing: 'Triple', vehicle: 'RE Himalayan (Solo)', base: 27999, sale: 24999 },
    { sharing: 'Double', vehicle: 'SIC (Seat in Coach)', base: 21999, sale: 19999 },
    { sharing: 'Double', vehicle: 'RE Himalayan (Pillion)', base: 25999, sale: 22999 },
    { sharing: 'Double', vehicle: 'RE Himalayan (Solo)', base: 30999, sale: 27999 },
  ],
  'leh-leh-with-turtuk-6n7d': [
    { sharing: 'Triple', vehicle: 'SIC (Seat in Coach)', base: 21999, sale: 18999 },
    { sharing: 'Triple', vehicle: 'RE Himalayan (Pillion)', base: 24999, sale: 22999 },
    { sharing: 'Triple', vehicle: 'RE Himalayan (Solo)', base: 29999, sale: 27999 },
    { sharing: 'Double', vehicle: 'SIC (Seat in Coach)', base: 24999, sale: 21999 },
    { sharing: 'Double', vehicle: 'RE Himalayan (Pillion)', base: 27999, sale: 25999 },
    { sharing: 'Double', vehicle: 'RE Himalayan (Solo)', base: 32999, sale: 30999 },
  ],
  'leh-to-leh-with-umling-la-hanle-tso-moriri': [
    { sharing: 'Triple', vehicle: 'SIC (Seat in Coach)', base: 28999, sale: 26999 },
    { sharing: 'Triple', vehicle: 'RE Himalayan (Pillion)', base: 29999, sale: 26999 },
    { sharing: 'Triple', vehicle: 'RE Himalayan (Solo)', base: 39999, sale: 36999 },
    { sharing: 'Double', vehicle: 'SIC (Seat in Coach)', base: 31999, sale: 29999 },
    { sharing: 'Double', vehicle: 'RE Himalayan (Pillion)', base: 32999, sale: 29999 },
    { sharing: 'Double', vehicle: 'RE Himalayan (Solo)', base: 42999, sale: 39999 },
  ],
  'winter-spiti-expedition': [
    { sharing: 'Quad', vehicle: null, base: 17499, sale: 16999 },
    { sharing: 'Triple', vehicle: null, base: 18499, sale: 17999 },
    { sharing: 'Double', vehicle: null, base: 19499, sale: 18999 },
  ],
  'spiti-valley-with-sangla-holi': [
    { sharing: 'Triple', vehicle: null, base: 19999, sale: 18999 },
    { sharing: 'Double', vehicle: null, base: 21999, sale: 20999 },
  ],
  'sangla-holi-special': [
    { sharing: 'Quad', vehicle: null, base: 13999, sale: 12999 },
    { sharing: 'Triple', vehicle: null, base: 14999, sale: 13999 },
    { sharing: 'Double', vehicle: null, base: 15999, sale: 14999 },
  ],
  'ladakh-apricot-blossom': [
    { sharing: 'Triple', vehicle: 'SIT (Sit on Coach)', base: 22999, sale: 20999 },
    { sharing: 'Triple', vehicle: 'RE Himalayan 411 (Dual Rider)', base: 27999, sale: 24999 },
    { sharing: 'Triple', vehicle: 'RE Himalayan 450 (Dual Rider)', base: 32999, sale: 29999 },
    { sharing: 'Triple', vehicle: 'RE Himalayan 411 (Solo Rider)', base: 33999, sale: 30999 },
    { sharing: 'Triple', vehicle: 'RE Himalayan 450 (Solo Rider)', base: 37999, sale: 34999 },
    { sharing: 'Double', vehicle: 'SIT (Sit on Coach)', base: 25999, sale: 23999 },
    { sharing: 'Double', vehicle: 'RE Himalayan 411 (Dual Rider)', base: 30999, sale: 27999 },
    { sharing: 'Double', vehicle: 'RE Himalayan 450 (Dual Rider)', base: 35999, sale: 32999 },
    { sharing: 'Double', vehicle: 'RE Himalayan 411 (Solo Rider)', base: 36999, sale: 33999 },
    { sharing: 'Double', vehicle: 'RE Himalayan 450 (Solo Rider)', base: 40999, sale: 37999 },
  ],
};

function nowStamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function toIsoDate(raw) {
  const value = String(raw || '').trim();
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return '';
  return new Date(ms).toISOString().slice(0, 10);
}

function csvEscape(value) {
  const text = String(value ?? '');
  if (!/[",\n]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function writeCsv(filePath, rows, columns) {
  const lines = [columns.join(',')];
  for (const row of rows) {
    lines.push(columns.map((col) => csvEscape(row[col])).join(','));
  }
  fs.writeFileSync(filePath, `${lines.join('\n')}\n`);
}

function formatVariantName(sharing, vehicle) {
  if (vehicle) return `${vehicle} - ${sharing}`;
  return sharing;
}

function assertDomesticVariantIntegrity(rows) {
  const issues = [];
  for (const row of rows) {
    const sharing = String(row.sharing || '');
    if (!SHARING_VALUES.includes(sharing)) {
      issues.push(`Invalid sharing value: ${sharing}`);
    }
    if (/sharing/i.test(String(row.vehicle || ''))) {
      issues.push(`Vehicle contains sharing text: ${row.vehicle}`);
    }
  }
  if (issues.length > 0) {
    throw new Error(`Domestic variant integrity failed:\n${issues.slice(0, 20).join('\n')}`);
  }
}

async function sb(pathname, { method = 'GET', body, headers = {} } = {}) {
  const res = await fetch(`${SB_URL}/rest/v1/${pathname}`, {
    method,
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      'Content-Type': 'application/json',
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!res.ok) {
    throw new Error(`Supabase ${method} ${pathname} -> ${res.status} ${text.slice(0, 500)}`);
  }

  return data;
}

async function sbSelectAll(pathBase) {
  const out = [];
  let offset = 0;
  const limit = 1000;

  while (true) {
    const sep = pathBase.includes('?') ? '&' : '?';
    const pagePath = `${pathBase}${sep}limit=${limit}&offset=${offset}`;
    const rows = await sb(pagePath);
    if (!Array.isArray(rows) || rows.length === 0) break;
    out.push(...rows);
    if (rows.length < limit) break;
    offset += limit;
  }

  return out;
}

function makeInFilter(values) {
  return `in.(${values.map((v) => `"${String(v).replace(/"/g, '\\"')}"`).join(',')})`;
}

function parseDateSource(filePath) {
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
  const dateMap = new Map();

  for (const row of rows) {
    const rawSlug = String(row.slug || '').trim();
    const slug = DATE_ALIAS[rawSlug] || rawSlug;
    const date = toIsoDate(row.start_date);
    if (!slug || !date) continue;
    if (!dateMap.has(slug)) dateMap.set(slug, new Set());
    dateMap.get(slug).add(date);
  }

  return dateMap;
}

function mergeDateMaps(base, additions) {
  for (const [slug, dates] of additions.entries()) {
    if (!base.has(slug)) base.set(slug, new Set());
    for (const date of dates) base.get(slug).add(date);
  }
}

function getSortedDates(dateMap, slug) {
  const set = dateMap.get(slug) || new Set();
  return [...set].sort();
}

function buildPricingRows({ tripIdBySlug, dateMap }) {
  const rows = [];

  for (const trip of TRIPS) {
    const tripId = tripIdBySlug.get(trip.slug);
    if (!tripId) {
      throw new Error(`Missing trip_id for slug ${trip.slug}`);
    }

    if (trip.type === DOMESTIC) {
      const variants = DOMESTIC_VARIANTS[trip.slug] || [];
      assertDomesticVariantIntegrity(variants);

      let dates = getSortedDates(dateMap, trip.slug);
      const fallbackSlug = DATE_FALLBACK_SLUG[trip.slug];
      if (dates.length === 0 && fallbackSlug) {
        dates = getSortedDates(dateMap, fallbackSlug);
      }
      if (dates.length === 0) dates = [DEFAULT_DATE];

      for (const startDate of dates) {
        for (const variant of variants) {
          const base = Number(variant.base);
          const sale = Number(variant.sale);
          const discount = Math.max(0, base - sale);

          rows.push({
            trip_id: tripId,
            variant_name: formatVariantName(variant.sharing, variant.vehicle),
            price: base,
            start_date: startDate,
            end_date: null,
            sharing: variant.sharing,
            vehicle: variant.vehicle,
            early_bird_enabled: discount > 0,
            early_bird_discount_type: discount > 0 ? 'fixed' : null,
            early_bird_discount_value: discount > 0 ? discount : null,
            early_bird_max_discount: null,
            early_bird_starts_at: null,
            early_bird_ends_at: null,
            early_bird_label: discount > 0 ? 'Nomads Summer Sale' : null,
          });
        }
      }
      continue;
    }

    const price = Number(trip.fixedPrice || 0);
    if (!Number.isFinite(price) || price <= 0) {
      throw new Error(`Invalid fixed international price for ${trip.slug}`);
    }

    rows.push({
      trip_id: tripId,
      variant_name: 'Standard',
      price,
      start_date: null,
      end_date: null,
      sharing: null,
      vehicle: null,
      early_bird_enabled: false,
      early_bird_discount_type: null,
      early_bird_discount_value: null,
      early_bird_max_discount: null,
      early_bird_starts_at: null,
      early_bird_ends_at: null,
      early_bird_label: null,
    });
  }

  // Deduplicate by unique key.
  const dedup = new Map();
  for (const row of rows) {
    const key = [
      row.trip_id,
      row.start_date || '',
      row.sharing || '',
      row.vehicle || '',
    ].join('::');
    dedup.set(key, row);
  }

  return [...dedup.values()];
}

function buildPreviewRows(pricingRows, tripById) {
  return pricingRows
    .map((row) => {
      const trip = tripById.get(row.trip_id) || {};
      const discount = Number(row.early_bird_discount_value || 0);
      const salePrice = discount > 0 ? Number(row.price) - discount : Number(row.price);
      return {
        trip_slug: trip.slug || '',
        trip_title: trip.title || '',
        trip_type: trip.type || '',
        trip_id: row.trip_id,
        start_date: row.start_date || '',
        sharing: row.sharing || '',
        vehicle: row.vehicle || '',
        base_price: Number(row.price),
        sale_price: salePrice,
        early_bird_discount: discount,
      };
    })
    .sort((a, b) => {
      if (a.trip_slug !== b.trip_slug) return a.trip_slug.localeCompare(b.trip_slug);
      if (a.start_date !== b.start_date) return String(a.start_date).localeCompare(String(b.start_date));
      if (a.vehicle !== b.vehicle) return String(a.vehicle).localeCompare(String(b.vehicle));
      return String(a.sharing).localeCompare(String(b.sharing));
    });
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

async function main() {
  ensureDir(OUT_DIR);
  const stamp = nowStamp();

  const launchSlugs = new Set(TRIPS.map((t) => t.slug));
  const tripsBySlugConfig = new Map(TRIPS.map((t) => [t.slug, t]));

  const [existingTrips, existingPricing, existingBookings] = await Promise.all([
    sbSelectAll('trips?select=*'),
    sbSelectAll('trip_pricing?select=*'),
    sbSelectAll('bookings?select=*'),
  ]);

  fs.writeFileSync(path.join(OUT_DIR, `${stamp}_trips_before.json`), JSON.stringify(existingTrips, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, `${stamp}_trip_pricing_before.json`), JSON.stringify(existingPricing, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, `${stamp}_bookings_before.json`), JSON.stringify(existingBookings, null, 2));

  const tripsByIdBefore = new Map(existingTrips.map((t) => [t.id, t]));

  const dateMap = parseDateSource(DATE_SOURCE_CSV);

  // Also include existing dates as fallback where available.
  const dateMapFromExisting = new Map();
  for (const row of existingPricing) {
    const trip = tripsByIdBefore.get(row.trip_id);
    if (!trip?.slug) continue;
    const canonicalSlug = DATE_ALIAS[trip.slug] || trip.slug;
    const date = toIsoDate(row.start_date);
    if (!date) continue;
    if (!dateMapFromExisting.has(canonicalSlug)) dateMapFromExisting.set(canonicalSlug, new Set());
    dateMapFromExisting.get(canonicalSlug).add(date);
  }
  mergeDateMaps(dateMap, dateMapFromExisting);

  const missingDomesticDateSlugs = TRIPS
    .filter((t) => t.type === DOMESTIC)
    .map((t) => t.slug)
    .filter((slug) => {
      const hasOwn = getSortedDates(dateMap, slug).length > 0;
      const fallbackSlug = DATE_FALLBACK_SLUG[slug];
      const hasFallback = fallbackSlug ? getSortedDates(dateMap, fallbackSlug).length > 0 : false;
      return !hasOwn && !hasFallback;
    });

  const existingBySlug = new Map(existingTrips.map((t) => [t.slug, t]));
  const targetTrips = TRIPS.map((trip) => ({
    ...trip,
    id: crypto.randomUUID(),
  }));

  const tripIdBySlug = new Map(targetTrips.map((t) => [t.slug, t.id]));
  const tripById = new Map(targetTrips.map((t) => [t.id, t]));

  const pricingRows = buildPricingRows({ tripIdBySlug, dateMap });
  const previewRows = buildPreviewRows(pricingRows, tripById);

  const previewCsvPath = path.join(OUT_DIR, `${stamp}_launch_trip_pricing_preview.csv`);
  writeCsv(previewCsvPath, previewRows, [
    'trip_slug',
    'trip_title',
    'trip_type',
    'trip_id',
    'start_date',
    'sharing',
    'vehicle',
    'base_price',
    'sale_price',
    'early_bird_discount',
  ]);

  const mappingCsvPath = path.join(OUT_DIR, `${stamp}_launch_mapping_preview.csv`);
  writeCsv(mappingCsvPath, targetTrips, ['pdfName', 'slug', 'title', 'type', 'id']);

  const framerTripIdSyncCsvPath = path.join(OUT_DIR, `${stamp}_framer_trip_id_sync.csv`);
  writeCsv(
    framerTripIdSyncCsvPath,
    targetTrips.map((trip) => ({
      slug: trip.slug,
      title: trip.title,
      trip_id: trip.id,
    })),
    ['slug', 'title', 'trip_id']
  );

  const summary = {
    apply: APPLY,
    before_trip_count: existingTrips.length,
    before_pricing_count: existingPricing.length,
    target_trip_count: targetTrips.length,
    target_pricing_count: pricingRows.length,
    removed_non_launch_trip_count: existingTrips.filter((t) => !launchSlugs.has(t.slug)).length,
    missing_domestic_date_slugs: missingDomesticDateSlugs,
    preview_csv: previewCsvPath,
    trip_id_map_csv: mappingCsvPath,
    framer_trip_id_sync_csv: framerTripIdSyncCsvPath,
  };

  if (!APPLY) {
    const summaryPath = path.join(OUT_DIR, `${stamp}_summary_preview.json`);
    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
    console.log(JSON.stringify({ ok: true, mode: 'preview', summary_path: summaryPath, ...summary }, null, 2));
    return;
  }

  // 1) Delete all existing pricing rows and rebuild clean.
  const pricingIds = existingPricing.map((row) => row.id).filter(Boolean);
  for (const idBatch of chunk(pricingIds, 100)) {
    await sb(`trip_pricing?id=${encodeURIComponent(makeInFilter(idBatch))}`, {
      method: 'DELETE',
      headers: { Prefer: 'return=minimal' },
    });
  }

  // 2) Hard-delete all current trips, then recreate canonical launch trips with regenerated IDs.
  const currentTrips = await sbSelectAll('trips?select=id,slug,title,active');
  const tripsToDelete = currentTrips.map((t) => t.id).filter(Boolean);

  for (const tripBatch of chunk(tripsToDelete, 50)) {
    if (tripBatch.length === 0) continue;
    await sb(`trips?id=${encodeURIComponent(makeInFilter(tripBatch))}`, {
      method: 'DELETE',
      headers: { Prefer: 'return=minimal' },
    });
  }

  for (const trip of targetTrips) {
    await sb('trips', {
      method: 'POST',
      body: {
        id: trip.id,
        title: trip.title,
        slug: trip.slug,
        active: true,
      },
      headers: { Prefer: 'return=minimal' },
    });
  }

  // 2b) Preserve historical bookings by remapping launch trip_ids to regenerated IDs.
  for (const trip of targetTrips) {
    const previous = existingBySlug.get(trip.slug);
    if (!previous?.id || previous.id === trip.id) continue;
    await sb(`bookings?trip_id=eq.${encodeURIComponent(previous.id)}`, {
      method: 'PATCH',
      body: { trip_id: trip.id },
      headers: { Prefer: 'return=minimal' },
    });
  }

  for (const insertBatch of chunk(pricingRows, 250)) {
    await sb('trip_pricing', {
      method: 'POST',
      body: insertBatch,
      headers: { Prefer: 'return=minimal' },
    });
  }

  // 3) Verify integrity.
  const [afterTrips, afterPricing] = await Promise.all([
    sbSelectAll('trips?select=id,slug,title,active'),
    sbSelectAll('trip_pricing?select=id,trip_id,start_date,price,sharing,vehicle,early_bird_enabled,early_bird_discount_value'),
  ]);

  const launchTripIds = new Set(afterTrips.filter((t) => launchSlugs.has(t.slug)).map((t) => t.id));
  const pricingOutsideLaunch = afterPricing.filter((row) => !launchTripIds.has(row.trip_id));
  const badDomesticSharing = afterPricing.filter((row) => {
    const trip = afterTrips.find((t) => t.id === row.trip_id);
    if (!trip) return true;
    const cfg = tripsBySlugConfig.get(trip.slug);
    if (!cfg) return true;
    if (cfg.type !== DOMESTIC) return false;
    return !SHARING_VALUES.includes(String(row.sharing || ''));
  });

  const domesticTripIds = new Set(
    afterTrips
      .filter((trip) => launchSlugs.has(trip.slug) && tripsBySlugConfig.get(trip.slug)?.type === DOMESTIC)
      .map((trip) => trip.id)
  );
  const internationalTripIds = new Set(
    afterTrips
      .filter((trip) => launchSlugs.has(trip.slug) && tripsBySlugConfig.get(trip.slug)?.type === INTERNATIONAL)
      .map((trip) => trip.id)
  );
  const domesticTripsWithoutPricing = [...domesticTripIds].filter(
    (tripId) => !afterPricing.some((row) => row.trip_id === tripId)
  );

  const internationalIssues = [];
  for (const tripId of internationalTripIds) {
    const rows = afterPricing.filter((row) => row.trip_id === tripId);
    if (rows.length !== 1) {
      internationalIssues.push({ trip_id: tripId, issue: `expected 1 pricing row, found ${rows.length}` });
      continue;
    }
    const row = rows[0];
    if (row.sharing != null || row.vehicle != null) {
      internationalIssues.push({ trip_id: tripId, issue: 'sharing/vehicle must be null for international single-row pricing' });
    }
  }

  const keySeen = new Set();
  const duplicates = [];
  for (const row of afterPricing) {
    const key = [row.trip_id, row.start_date || '', row.sharing || '', row.vehicle || ''].join('::');
    if (keySeen.has(key)) duplicates.push(key);
    keySeen.add(key);
  }

  const verification = {
    non_launch_trips_remaining: afterTrips.filter((t) => !launchSlugs.has(t.slug)).length,
    pricing_outside_launch: pricingOutsideLaunch.length,
    bad_domestic_sharing_rows: badDomesticSharing.length,
    domestic_trips_without_pricing: domesticTripsWithoutPricing.length,
    international_pricing_issues: internationalIssues.length,
    duplicate_pricing_keys: duplicates.length,
  };

  const afterRows = buildPreviewRows(
    afterPricing.map((row) => {
      const trip = afterTrips.find((t) => t.id === row.trip_id);
      return {
        ...row,
        trip_id: row.trip_id,
        start_date: row.start_date,
        sharing: row.sharing,
        vehicle: row.vehicle,
        price: row.price,
        early_bird_discount_value: row.early_bird_discount_value,
        early_bird_enabled: row.early_bird_enabled,
        _slug: trip?.slug || '',
        _title: trip?.title || '',
      };
    }),
    new Map(afterTrips.map((t) => [t.id, { slug: t.slug, title: t.title, type: (tripsBySlugConfig.get(t.slug)?.type || '') }]))
  );

  const afterCsvPath = path.join(OUT_DIR, `${stamp}_launch_trip_pricing_after.csv`);
  writeCsv(afterCsvPath, afterRows, [
    'trip_slug',
    'trip_title',
    'trip_type',
    'trip_id',
    'start_date',
    'sharing',
    'vehicle',
    'base_price',
    'sale_price',
    'early_bird_discount',
  ]);

  const integrityDetailsPath = path.join(OUT_DIR, `${stamp}_verification_details.json`);
  fs.writeFileSync(
    integrityDetailsPath,
    JSON.stringify(
      {
        domestic_trips_without_pricing: domesticTripsWithoutPricing,
        international_issues: internationalIssues,
        duplicate_keys_sample: duplicates.slice(0, 100),
      },
      null,
      2
    )
  );

  const summaryPath = path.join(OUT_DIR, `${stamp}_summary_apply.json`);
  fs.writeFileSync(
    summaryPath,
    JSON.stringify(
      {
        ...summary,
        after_trip_count: afterTrips.length,
        after_pricing_count: afterPricing.length,
        verification,
        after_csv: afterCsvPath,
        verification_details: integrityDetailsPath,
      },
      null,
      2
    )
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        mode: 'apply',
        summary_path: summaryPath,
        verification,
        preview_csv: previewCsvPath,
        after_csv: afterCsvPath,
        trip_id_map_csv: mappingCsvPath,
        framer_trip_id_sync_csv: framerTripIdSyncCsvPath,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err?.stack || err?.message || String(err));
  process.exit(1);
});
