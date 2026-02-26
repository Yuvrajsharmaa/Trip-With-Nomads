import fs from 'fs';

// Read Parsed Excel
const excelData = JSON.parse(fs.readFileSync('parsed_excel.json', 'utf8'));

// State machine to parse dirty excel structure
let currentTrip = null;
let currentTransport = null;
const parsedTrips = [];

for (let i = 1; i < excelData.length; i++) {
    const row = excelData[i];

    // Check if it's a new trip block (has __EMPTY = Sr. No)
    if (row['__EMPTY']) {
        const srNo = Number(row['__EMPTY']);
        if (!isNaN(srNo)) {
            currentTrip = {
                name: row['__EMPTY_1'],
                variants: []
            };
            currentTransport = null;
            parsedTrips.push(currentTrip);
            continue;
        }
    }

    const col1 = row['__EMPTY_1'] ? String(row['__EMPTY_1']).trim() : null;
    const originalPrice = row['Trips with discount Prices for Nomads Early Bird Summer Sale'];
    const discountedPrice = row['__EMPTY_2'];

    if (col1 && !originalPrice && !discountedPrice && isNaN(Number(originalPrice))) {
        continue;
    }

    if (!col1 && typeof originalPrice === 'string' && typeof discountedPrice === 'string' && originalPrice === discountedPrice) {
        currentTransport = originalPrice;
        continue;
    }

    if (col1 && originalPrice > 0 && discountedPrice > 0) {
        currentTrip.variants.push({
            name: col1,
            transport: currentTransport,
            originalPrice: Number(originalPrice),
            discountedPrice: Number(discountedPrice)
        });
    }
}

// Map them manually by slug/name keywords
const SLUG_MAP = {
    'Summer Spiti with Chandrataal (6N7D)': 'summer-spiti',
    '4x4 Summer Spiti Expedition (6N7D)': '4x4-summer-spiti',
    'Spiti Biking': 'spiti-biking',
    'Manali with Chandrataal (Delhi-Delhi)': 'manali-with-chandrataal-2n',
    'Teen Taal (Delhi-Delhi)': 'teen-taal',
    'Teen Taal with Gombo Ranjan': 'teen-taal-with-gopuranjan-4n',
    'Zanskar Valley 6N7D - Tempo Traveller': 'zanskar-6n',
    'Kedarnath Yatra 3N4D - Normal Package': 'do-dhaam', // Wait, we mapped 'do-dhaam' to 'Kedarnath With Badrinath 4N' earlier. Let's just use it and let SQL handle missing variants
    'Leh-Leh with Turtuk 5N6D': 'leh-to-leh-with-turtuk-5n6d',
    'Leh-Leh with Turtuk 6N7D': 'leh-to-leh-with-turtuk-6n7d',
    'Ladakh - Hanle & Umling La - 7N8D': 'leh-to-leh-with-umling-la-hanle-tso-moriri',
    'Winter Spiti Expedition 6N7D': 'winter-spiti-expedition',
    'Spiti Valley with Sangla Holi 6N7D': 'spiti-valley-with-sangla-holi',
    'Sangla Holi 3N4D': 'sangla-holi-special',
    'Ladakh Apricot Blossom 6N7D - TRIPLE SHARING': 'ladakh-apricot-blossom'
};

let sql = '-- Generated Early Bird Sale Updates\n\n';

sql += `WITH sale_map AS (
    SELECT * FROM (VALUES\n`;

const values = [];

for (const trip of parsedTrips) {
    const slug = SLUG_MAP[trip.name];
    if (!slug) {
        console.log("No mapping found for excel trip:", trip.name);
        continue;
    }

    for (const v of trip.variants) {
        let variantName = v.name;
        // Adjust common mismatches
        if (variantName === 'Quad') variantName = 'Quad Sharing';
        if (variantName === 'Triple') variantName = 'Triple Sharing';
        if (variantName === 'Double') variantName = 'Double Sharing';
        // Specifics matching your screenshot/DB outputs previously
        if (variantName === 'SIC (Seat In Couch) - Triple') variantName = 'SIC (Seat in Couch) - Triple Sharing';
        if (variantName === 'SIC (Seat In Couch) - Double') variantName = 'SIC (Seat in Couch) - Double Sharing';
        if (variantName === 'SIT (Sit on Coach)') variantName = 'SIC (Seat in Couch) - Triple Sharing'; // Typical spelling fix
        if (variantName.includes('RE Himalayan') || variantName.includes('Re Himalayan')) {
            // "RE HImalayan Solo Rider - Triple" -> "RE Himalayan Solo - Triple Sharing"
            let reName = variantName;
            reName = reName.replace(/Re Himalayan/ig, 'RE Himalayan');
            reName = reName.replace(/HImalayan/ig, 'Himalayan');
            reName = reName.replace(/Solo Rider/ig, 'Solo');
            reName = reName.replace(/Dual Rider/ig, 'Dual');
            reName = reName.replace(/Pillion Rider/ig, 'Dual');
            reName = reName.replace(/Pillion/ig, 'Dual');
            reName = reName.replace(/ - Triple/ig, ' - Triple Sharing');
            reName = reName.replace(/ - Double/ig, ' - Double Sharing');
            variantName = reName;
        }

        values.push(`        ('${slug}', '${variantName}', ${v.discountedPrice}::numeric)`);
    }
}

sql += values.join(',\n') + `\n    ) AS t(slug, variant_name, sale_price)
),
updated AS (
    UPDATE public.trip_pricing tp
    SET
        early_bird_enabled = TRUE,
        early_bird_discount_type = 'flat',
        early_bird_discount_value = GREATEST(COALESCE(tp.price, 0) - sm.sale_price, 0),
        early_bird_starts_at = NOW(),
        early_bird_label = 'Summer Early Bird Sale 2026'
    FROM public.trips tr
    JOIN sale_map sm ON sm.slug = tr.slug
    WHERE tp.trip_id = tr.id
      AND LOWER(TRIM(tp.variant_name)) = LOWER(TRIM(sm.variant_name))
      AND tp.price > 0
    RETURNING tp.id, tr.slug, sm.variant_name as mapped_variant, tp.variant_name as db_variant, COALESCE(tp.price, 0) - sm.sale_price as discount
)
SELECT * FROM updated;\n`;

fs.writeFileSync('generate_sale.sql', sql);

console.log("\n===== SUMMARY =====");
console.log(`Parsed ${parsedTrips.length} trips from Excel.`);
console.log(`Generated SQL with ${values.length} mapping rows.`);
