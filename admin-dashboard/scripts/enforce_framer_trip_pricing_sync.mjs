import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { EventSource } from 'eventsource';

global.EventSource = EventSource;

const MCP_URL = 'https://mcp.unframer.co/sse?id=73506ef3a425ea9adf787e19fc7caddc64fe18181bcc24132d988e0397845253&secret=lxsqy1Gm5ZSDmnDuqflUOUhthJg00lBZ';
const FRAMER_TRIPS_COLLECTION_ID = 'Z1Bphf6oI';

const SB_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
if (!SB_URL || !SB_KEY) {
  throw new Error("Missing Supabase credentials. Set SUPABASE_URL and SUPABASE_ANON_KEY (or VITE_ equivalents).");
}

const ALLOWED_SLUGS = new Set([
  'summer-spiti',
  '4x4-summer-spiti-expedition-6n7d',
  'spiti-biking',
  'manali-with-chandrataal-delhi-delhi',
  'teen-taal',
  'teen-taal-with-gombo-ranjan',
  'zanskar-valley-6n7d-tempo-traveller',
  'kedarnath-yatra',
  'ladakh-leh-to-leh-with-turtuk',
  'leh-leh-with-turtuk-6n7d',
  'leh-to-leh-with-umling-la-hanle-tso-moriri',
  'winter-spiti-expedition',
  'spiti-valley-with-sangla-holi',
  'sangla-holi-special',
  'ladakh-apricot-blossom',
  'bali-with-nusa-gili-t',
  'thailand-songkran-festival',
  'thailand-full-moon-party',
  'almaty',
  'sri-lanka',
  'dubai',
  'japan',
]);

const CATEGORY_IDS = {
  domestic: 'cM2c_OUfl',
  international: 'CGBOBJknj',
};

const INTERNATIONAL_SLUGS = new Set([
  'almaty',
  'bali-with-nusa-gili-t',
  'sri-lanka',
  'thailand-songkran-festival',
  'thailand-full-moon-party',
  'dubai',
  'japan',
]);

function categoryForSlug(slug) {
  return INTERNATIONAL_SLUGS.has(slug) ? CATEGORY_IDS.international : CATEGORY_IDS.domestic;
}

function extractValue(v) {
  return (v && typeof v === 'object' && 'value' in v) ? v.value : v;
}

async function sb(pathname) {
  const res = await fetch(`${SB_URL}/rest/v1/${pathname}`, {
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Supabase ${pathname} -> ${res.status} ${text.slice(0, 500)}`);
  }
  return JSON.parse(text);
}

async function callToolWithRetry(client, payload, retries = 5) {
  let lastErr;
  for (let i = 1; i <= retries; i++) {
    try {
      const res = await client.callTool(payload);
      const txt = (res?.content || []).map((c) => c?.text || '').join('\n').trim();
      if (txt.startsWith('Encountered an error')) {
        throw new Error(txt);
      }
      return res;
    } catch (e) {
      lastErr = e;
      if (i < retries) await new Promise((r) => setTimeout(r, 1200 * i));
    }
  }
  throw lastErr;
}

async function main() {
  const [trips, pricing] = await Promise.all([
    sb('trips?select=id,slug,title,active'),
    sb('trip_pricing?select=trip_id,price,early_bird_enabled,early_bird_discount_value'),
  ]);

  const allowedTrips = trips.filter((t) => ALLOWED_SLUGS.has(t.slug));
  const tripBySlug = new Map(allowedTrips.map((t) => [t.slug, t]));

  const minDisplayPriceByTripId = new Map();
  for (const row of pricing) {
    const base = Number(row.price || 0);
    const discount = row.early_bird_enabled ? Number(row.early_bird_discount_value || 0) : 0;
    const display = Math.max(0, base - discount);
    if (!Number.isFinite(display) || display <= 0) continue;
    const prev = minDisplayPriceByTripId.get(row.trip_id);
    if (prev == null || display < prev) minDisplayPriceByTripId.set(row.trip_id, display);
  }

  const transport = new SSEClientTransport(new URL(MCP_URL));
  const client = new Client({ name: 'framer-enforce-sync', version: '1.0.0' }, { capabilities: {} });
  await client.connect(transport);

  try {
    const itemsRes = await callToolWithRetry(client, {
      name: 'getCMSItems',
      arguments: { collectionId: FRAMER_TRIPS_COLLECTION_ID, limit: 500 },
    });
    const txt = (itemsRes.content || []).map((c) => c.text || '').join('\n');
    const parsed = JSON.parse(txt);
    const items = parsed.items || [];

    const bySlug = new Map();
    for (const item of items) {
      if (!bySlug.has(item.slug)) bySlug.set(item.slug, []);
      bySlug.get(item.slug).push(item);
    }

    const actions = {
      upsertAllowed: 0,
      draftDisallowed: 0,
      draftedDuplicates: 0,
      createdAllowed: 0,
    };

    // Ensure allowed slugs are present, active, and mapped to correct trip_id + base_price.
    for (const slug of ALLOWED_SLUGS) {
      const trip = tripBySlug.get(slug);
      if (!trip) continue;
      const basePrice = minDisplayPriceByTripId.get(trip.id) || null;
      const fieldData = {
        edpZYc3f0: { type: 'string', value: trip.title },
        sOpVBzQ8v: { type: 'string', value: trip.id },
        dkXJnSrLi: { type: 'boolean', value: true },
        q1IsKozNh: { type: 'collectionReference', value: categoryForSlug(slug) },
        EM1Da5Zbe: { type: 'multiCollectionReference', value: [categoryForSlug(slug)] },
        ...(basePrice ? { L131_KPPt: { type: 'number', value: Number(basePrice) } } : {}),
      };

      const candidates = bySlug.get(slug) || [];
      if (!candidates.length) {
        await callToolWithRetry(client, {
          name: 'upsertCMSItem',
          arguments: {
            collectionId: FRAMER_TRIPS_COLLECTION_ID,
            slug,
            fieldData,
          },
        });
        actions.createdAllowed += 1;
      } else {
        const keeper = candidates[0];
        await callToolWithRetry(client, {
          name: 'upsertCMSItem',
          arguments: {
            collectionId: FRAMER_TRIPS_COLLECTION_ID,
            itemId: keeper.id,
            slug,
            fieldData,
          },
        });
        actions.upsertAllowed += 1;

        for (const dup of candidates.slice(1)) {
          await callToolWithRetry(client, {
            name: 'upsertCMSItem',
            arguments: {
              collectionId: FRAMER_TRIPS_COLLECTION_ID,
              itemId: dup.id,
              fieldData: {
                dkXJnSrLi: { type: 'boolean', value: false },
              },
            },
          });
          actions.draftedDuplicates += 1;
        }
      }
    }

    // Draft everything else.
    for (const item of items) {
      if (ALLOWED_SLUGS.has(item.slug)) continue;
      const fd = item.fieldData || {};
      const isActive = extractValue(fd.dkXJnSrLi);
      if (isActive === false) continue;
      await callToolWithRetry(client, {
        name: 'upsertCMSItem',
          arguments: {
            collectionId: FRAMER_TRIPS_COLLECTION_ID,
            itemId: item.id,
            fieldData: {
              dkXJnSrLi: { type: 'boolean', value: false },
              q1IsKozNh: { type: 'collectionReference', value: categoryForSlug(item.slug || '') },
              EM1Da5Zbe: { type: 'multiCollectionReference', value: [categoryForSlug(item.slug || '')] },
            },
          },
        });
      actions.draftDisallowed += 1;
    }

    console.log(JSON.stringify({
      ok: true,
      allowedTrips: allowedTrips.length,
      framerItems: items.length,
      actions,
    }, null, 2));
  } finally {
    await client.close();
  }
}

main().catch((e) => {
  console.error(e?.stack || e?.message || String(e));
  process.exit(1);
});
