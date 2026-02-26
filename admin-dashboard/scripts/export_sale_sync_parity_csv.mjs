import fs from 'node:fs';
import path from 'node:path';
import XLSX from 'xlsx';

const SHEET_PATH = '/Users/yuvrajsharma/Downloads/Nomads Early Bird Summer Sale.xlsx';
const OUT_DIR = '/Users/yuvrajsharma/Desktop/Trip-With-Nomads/framer-website/reports/sale_sync';
const SB_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
if (!SB_URL || !SB_KEY) {
  throw new Error("Missing Supabase credentials. Set SUPABASE_URL and SUPABASE_ANON_KEY (or VITE_ equivalents).");
}

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

function norm(v) {
  return String(v || '').replace(/\s+/g, ' ').trim();
}

function normalizeVariantName(raw) {
  let v = norm(raw);
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
  if (/^\s*triple\s*$/i.test(v)) v = 'Triple Sharing';
  if (/^\s*double\s*$/i.test(v)) v = 'Double Sharing';
  if (/^\s*quad\s*$/i.test(v)) v = 'Quad Sharing';
  return norm(v);
}

function parseSheet(filePath) {
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: null, raw: false });
  const priceCol = 'Trips with discount Prices for Nomads Early Bird Summer Sale';
  const discountCol = '__EMPTY_2';
  const trips = [];
  let current = null;
  let currentTransport = null;

  for (const row of rows) {
    const sr = Number(row.__EMPTY);
    const c1 = norm(row.__EMPTY_1);
    const rawPrice = norm(row[priceCol]);
    const rawDisc = norm(row[discountCol]);
    const price = Number(rawPrice);
    const disc = Number(rawDisc);

    if (Number.isFinite(sr) && sr > 0 && c1 && SHEET_TRIP_MAP[c1]) {
      current = {
        sourceName: c1,
        slug: SHEET_TRIP_MAP[c1].slug,
        title: SHEET_TRIP_MAP[c1].title,
        variants: [],
      };
      currentTransport = null;
      trips.push(current);
      continue;
    }
    if (!current) continue;

    const transportRow = !c1 && rawPrice && rawDisc && rawPrice.toLowerCase() === rawDisc.toLowerCase() && Number.isNaN(price) && Number.isNaN(disc);
    if (transportRow) {
      currentTransport = rawPrice;
      continue;
    }

    if (c1 && Number.isFinite(price) && price > 0 && Number.isFinite(disc) && disc > 0) {
      current.variants.push({
        variant_name: normalizeVariantName(c1),
        transport_hint: norm(currentTransport),
        original_price: price,
        discounted_price: disc,
      });
    }
  }
  return trips;
}

async function sb(pathname) {
  const res = await fetch(`${SB_URL}/rest/v1/${pathname}`, {
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Supabase ${pathname} -> ${res.status} ${text.slice(0, 500)}`);
  return JSON.parse(text);
}

function csvEscape(v) {
  const s = String(v ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const saleTrips = parseSheet(SHEET_PATH);
  const allowedSlugs = new Set([...saleTrips.map((t) => t.slug), 'baku-without-shahdag', 'baku-with-shahdag']);
  const [trips, pricing] = await Promise.all([
    sb('trips?select=id,slug,title,active&order=slug.asc'),
    sb('trip_pricing?select=id,trip_id,start_date,variant_name,price,early_bird_enabled,early_bird_discount_type,early_bird_discount_value,early_bird_label&order=start_date.asc'),
  ]);

  const bySlug = new Map(trips.map((t) => [t.slug, t]));
  const byTripId = new Map(trips.map((t) => [t.id, t]));
  const allowedTripIds = new Set(trips.filter((t) => allowedSlugs.has(t.slug)).map((t) => t.id));
  const rows = pricing.filter((r) => allowedTripIds.has(r.trip_id));

  const sheetVariantBySlug = new Map();
  for (const t of saleTrips) {
    const m = new Map();
    for (const v of t.variants) {
      if (!m.has(v.variant_name.toLowerCase())) m.set(v.variant_name.toLowerCase(), v);
    }
    sheetVariantBySlug.set(t.slug, m);
  }

  const outRows = [];
  for (const r of rows) {
    const trip = byTripId.get(r.trip_id);
    const slug = trip?.slug || '';
    const variantNorm = norm(r.variant_name).toLowerCase();
    const sheetMeta = sheetVariantBySlug.get(slug)?.get(variantNorm) || null;
    const base = Number(r.price || 0);
    const discount = Number(r.early_bird_discount_value || 0);
    const payable = Math.max(0, base - discount);
    outRows.push({
      trip_slug: slug,
      trip_title: trip?.title || '',
      date: r.start_date || '',
      variant_name: r.variant_name || '',
      sheet_transport_hint: sheetMeta?.transport_hint || '',
      base_price_supabase: base,
      early_bird_discount_supabase: discount,
      payable_supabase: payable,
      sheet_original_price: sheetMeta?.original_price ?? '',
      sheet_discounted_price: sheetMeta?.discounted_price ?? '',
      price_match_sheet: sheetMeta ? (Number(sheetMeta.original_price) === base ? 'yes' : 'no') : '',
      discount_match_sheet: sheetMeta ? ((Number(sheetMeta.original_price) - Number(sheetMeta.discounted_price)) === discount ? 'yes' : 'no') : '',
      early_bird_enabled: r.early_bird_enabled ? 'true' : 'false',
      early_bird_label: r.early_bird_label || '',
      notes: sheetMeta ? '' : 'variant not found in sheet map',
    });
  }

  outRows.sort((a, b) =>
    a.trip_slug.localeCompare(b.trip_slug) ||
    a.date.localeCompare(b.date) ||
    a.variant_name.localeCompare(b.variant_name),
  );

  const header = [
    'trip_slug',
    'trip_title',
    'date',
    'variant_name',
    'sheet_transport_hint',
    'base_price_supabase',
    'early_bird_discount_supabase',
    'payable_supabase',
    'sheet_original_price',
    'sheet_discounted_price',
    'price_match_sheet',
    'discount_match_sheet',
    'early_bird_enabled',
    'early_bird_label',
    'notes',
  ];
  const lines = [header.join(',')];
  for (const row of outRows) lines.push(header.map((k) => csvEscape(row[k])).join(','));

  const id = stamp();
  const csvPath = path.join(OUT_DIR, `${id}_sale_sync_parity.csv`);
  const jsonPath = path.join(OUT_DIR, `${id}_sale_sync_parity.json`);
  fs.writeFileSync(csvPath, lines.join('\n'));
  fs.writeFileSync(jsonPath, JSON.stringify({ rows: outRows }, null, 2));

  const summary = {
    generated_at: new Date().toISOString(),
    csv: csvPath,
    json: jsonPath,
    total_rows: outRows.length,
    price_mismatch_rows: outRows.filter((r) => r.price_match_sheet === 'no').length,
    discount_mismatch_rows: outRows.filter((r) => r.discount_match_sheet === 'no').length,
    notes_rows: outRows.filter((r) => r.notes).length,
    allowed_trip_count: [...allowedSlugs].length,
    supabase_trip_count_total: trips.length,
    supabase_trip_count_allowed: trips.filter((t) => allowedSlugs.has(t.slug)).length,
  };
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((e) => {
  console.error(e?.stack || e?.message || String(e));
  process.exit(1);
});
