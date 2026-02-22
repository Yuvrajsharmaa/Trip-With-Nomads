/* scripts/generate_framer_csv.mjs */
import fs from 'fs';

const trips = JSON.parse(fs.readFileSync('parsed_trips.json', 'utf-8'));

// Framer CMS Format
// Header: Title, Slug, Duration, Description
let csvContent = "Title,Slug,Duration,Description\n";

trips.forEach(trip => {
    // Escape quotes
    const title = `"${trip.title.replace(/"/g, '""')}"`;
    const slug = trip.slug;
    const duration = `"${trip.duration.replace(/"/g, '""')}"`;
    const description = `""`; // Empty for now

    csvContent += `${title},${slug},${duration},${description}\n`;
});

fs.writeFileSync('framer_import.csv', csvContent);

console.log(`Generated framer_import.csv (${trips.length} rows)`);
