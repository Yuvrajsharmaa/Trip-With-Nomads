/* scripts/audit_sync_status.mjs */
import fs from 'fs';

// Load Framer Data
const rawFramerData = fs.readFileSync('framer_items.json', 'utf8');
const jsonStartIndex = rawFramerData.indexOf('{');
const framerData = JSON.parse(rawFramerData.substring(jsonStartIndex));
const framerItems = framerData.items || (framerData.content ? JSON.parse(framerData.content).items : []);

// Load Supabase Data
const supabaseTrips = JSON.parse(fs.readFileSync('supabase_trips.json', 'utf8'));

function normalize(str) {
    return str.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
}

const MANUAL_MAPPING = {
    "Winter Spiti Expedition": "Winter spiti",
    "Kedarnath Yatra": "Kedarnath 3N",
    "Do Dhaam": "Kedarnath With Badrinath 4N",
    "Bali with Nusa & Gili T": "Bali with Gili T.",
    "Thailand Songkran Festival": "Thailand  Songkaran",
    "Thailand full moon party": "Thailand Full Moon",
    "Spiti Valley with sangla holi": "Spiti With Sangla 6N 7D",
    "Sangla Holi Special": "Sangla Holi 3N 4D",
    "Baku with Shahdag": "Baku",
    "Baku without Shahdag": "Baku",
    "Vietnam": "Veitnam",
    "Teen taal": "Teen Taal 3N",
    "The Great Kashmir": "Kashmir"
};

const matched = [];
const unmatchedFramer = [];
const unmatchedSupabase = [];

// Track Supabase IDs matched to avoid duplicates in unmatched list (if 1-to-many)
const matchedSupabaseIds = new Set();

framerItems.forEach(fItem => {
    const fTitle = fItem.fieldData?.edpZYc3f0?.value || "Unknown Title";
    const fSlug = fItem.slug;

    let sMatch = supabaseTrips.find(sItem => normalize(sItem.title) === normalize(fTitle));

    if (!sMatch && MANUAL_MAPPING[fTitle]) {
        const mappedTitle = MANUAL_MAPPING[fTitle];
        sMatch = supabaseTrips.find(sItem => normalize(sItem.title) === normalize(mappedTitle));
    }

    if (sMatch) {
        matched.push({
            framerTitle: fTitle,
            framerSlug: fSlug,
            supabaseTitle: sMatch.title,
            supabaseSlug: sMatch.slug,
            supabaseId: sMatch.id
        });
        matchedSupabaseIds.add(sMatch.id);
    } else {
        unmatchedFramer.push({
            title: fTitle,
            slug: fSlug
        });
    }
});

supabaseTrips.forEach(sItem => {
    if (!matchedSupabaseIds.has(sItem.id)) {
        unmatchedSupabase.push({
            title: sItem.title,
            slug: sItem.slug,
            id: sItem.id
        });
    }
});

// Generate Markdown Report
let report = `# Sync Audit Report

## Summary
- **Framer Items:** ${framerItems.length}
- **Supabase Trips:** ${supabaseTrips.length}
- **Matched:** ${matched.length}
- **Unmatched (Framer):** ${unmatchedFramer.length}
- **Unmatched (Supabase):** ${unmatchedSupabase.length}

## 1. Matched Trips (Synced)
| Framer Title | Supabase Title | Supabase Slug | Status |
|---|---|---|---|
`;

matched.forEach(m => {
    const slugMatch = m.framerSlug === m.supabaseSlug ? "✅" : "❌ Slug Mismatch";
    report += `| ${m.framerTitle} | ${m.supabaseTitle} | ${m.supabaseSlug} | ${slugMatch} |\n`;
});

report += `\n## 2. Unmatched in Supabase (Present in Framer, Missing in DB)\nThese trips exist in Framer but have no corresponding record in Supabase.\n\n`;
unmatchedFramer.forEach(u => {
    report += `- **${u.title}** (Slug: \`${u.slug}\`)\n`;
});

report += `\n## 3. Unmatched in Framer (Present in DB, Missing in Framer)\nThese trips exist in Supabase but were not found in the Framer 'Domestic trips' collection.\n\n`;
unmatchedSupabase.forEach(u => {
    report += `- **${u.title}** (Slug: \`${u.slug || 'null'}\`)\n`;
});

fs.writeFileSync('sync_audit_report.md', report);
console.log("Report generated: sync_audit_report.md");
