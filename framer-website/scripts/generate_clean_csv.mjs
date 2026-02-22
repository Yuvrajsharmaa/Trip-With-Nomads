/* scripts/generate_clean_csv.mjs */
import fs from 'fs';

const trips = JSON.parse(fs.readFileSync('parsed_trips.json', 'utf-8'));

// 1. Trips CSV
// Headers: title, slug, duration
let tripsCsv = "title,slug,duration_text,image_url\n";

// 2. Pricing CSV
// Headers: trip_slug, variant_name, price, start_date, end_date
let pricingCsv = "trip_slug,variant_name,price,start_date,end_date,seats_available\n";

trips.forEach(trip => {
    // Escape specific chars if needed (simple quote wrap)
    const title = `"${trip.title.replace(/"/g, '""')}"`;
    const duration = `"${trip.duration.replace(/"/g, '""')}"`;
    const slug = trip.slug;

    tripsCsv += `${title},${slug},${duration},\n`;

    // Pricing Logic
    // We create a row for EACH date x EACH variant
    // If no variants, we might skip or put placeholder?
    // If no dates, we might skip?

    const variants = trip.variants.length > 0 ? trip.variants : [{ name: "Standard", price: 0 }];
    const dates = trip.dates.filter(d => d.type === 'specific'); // Only specific dates for now

    dates.forEach(date => {
        variants.forEach(variant => {
            const vName = `"${variant.name.replace(/"/g, '""')}"`;
            // For End Date, we need to parse duration? 
            // "6 Nights 7 Days" -> Add 6 days?
            // For now, leave End Date empty or same as start?
            // Let's assume start_date.

            pricingCsv += `${slug},${vName},${variant.price},${date.iso},,10\n`;
        });
    });
});

fs.writeFileSync('clean_trips.csv', tripsCsv);
fs.writeFileSync('clean_pricing.csv', pricingCsv);

console.log(`Generated clean_trips.csv (${trips.length} rows)`);
console.log(`Generated clean_pricing.csv`);
