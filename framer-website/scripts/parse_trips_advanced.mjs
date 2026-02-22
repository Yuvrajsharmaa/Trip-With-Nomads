/* scripts/parse_trips_advanced.mjs */
import fs from 'fs';
import path from 'path';

// Manual CSV Line Parser to handle quotes
function parseCSVLine(line) {
    const result = [];
    let start = 0;
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        if (line[i] === '"') {
            inQuotes = !inQuotes;
        } else if (line[i] === ',' && !inQuotes) {
            let field = line.substring(start, i);
            if (field.startsWith('"') && field.endsWith('"')) {
                field = field.slice(1, -1);
            }
            result.push(field.trim());
            start = i + 1;
        }
    }
    let field = line.substring(start);
    if (field.startsWith('"') && field.endsWith('"')) {
        field = field.slice(1, -1);
    }
    result.push(field.trim());
    return result;
}

const filePath = '/Users/yuvrajsharma/Downloads/Website Data Trips Dates.csv';

if (!fs.existsSync(filePath)) {
    console.error("File not found:", filePath);
    process.exit(1);
}

const content = fs.readFileSync(filePath, 'utf-8');
const lines = content.split('\n');

const trips = [];
let currentTrip = null;

// Regex for Price Parsing "Triple Sharing: INR 18,499 + GST"
const priceRegex = /^(.*?)(?:[:\-]|\sINR)\s*INR\s*([\d,]+)/i;

// Regex for Date Parsing "07th Feb - 15th Feb" -> "07th Feb"
const dateRegex = /(\d{1,2})(?:st|nd|rd|th)?\s*([A-Za-z]+)/i;

function parseDate(dateStr) {
    if (!dateStr) return null;
    // Handle "Every Friday" or complex strings -> mark as manual check needed?
    if (dateStr.toLowerCase().includes('every') || dateStr.toLowerCase().includes('starting')) {
        return { raw: dateStr, type: 'recurring' };
    }

    // Simple parser assuming 2026
    const startStr = dateStr.split(/[-\s]to[\s-]|[-\s]\&[\s-]/)[0];
    const match = startStr.match(dateRegex);
    if (match) {
        const day = parseInt(match[1]);
        const monthStr = match[2];
        const monthIndex = new Date(`${monthStr} 1, 2026`).getMonth();
        if (isNaN(monthIndex)) return { raw: dateStr, type: 'unknown' };

        const date = new Date(2026, monthIndex, day);
        // Format YYYY-MM-DD
        // Add 5.5 hours for IST if needed, but dates are dates.
        // Use UTC date string
        const yyyy = date.getFullYear();
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const dd = String(date.getDate()).padStart(2, '0');
        return { raw: dateStr, iso: `${yyyy}-${mm}-${dd}`, type: 'specific' };
    }
    return { raw: dateStr, type: 'unknown' };
}

for (let i = 2; i < lines.length; i++) { // Skip header rows 0,1
    const line = lines[i].trim();
    if (!line || line.startsWith(',')) {
        // Check if it's a continuation line (has data in subsequent columns)
        const cols = parseCSVLine(line);
        if (!cols[0] && !cols[1] && !cols[2]) continue; // Empty line
    }

    const cols = parseCSVLine(line);
    // [Name, Price, Date, Duration]
    // 0, 1, 2, 3

    if (cols[0]) {
        // New Trip
        if (currentTrip) trips.push(currentTrip);
        currentTrip = {
            title: cols[0],
            slug: cols[0].toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
            duration: cols[3] || '',
            variants: [], // { name, price }
            dates: []     // { raw, iso, type }
        };
    }

    if (!currentTrip) continue;

    const priceRaw = cols[1];
    const dateRaw = cols[2];

    // Add Price Variant
    if (priceRaw) {
        // Parse price
        const match = priceRaw.match(priceRegex);
        if (match) {
            // Check if variant already exists
            const name = match[1].trim() || "Standard";
            const price = parseInt(match[2].replace(/,/g, ''));

            if (!currentTrip.variants.find(v => v.name === name)) {
                currentTrip.variants.push({ name, price, raw: priceRaw });
            }
        } else {
            if (priceRaw.toLowerCase().includes('inr')) {
                // Try simple extraction
                const numbers = priceRaw.match(/([\d,]{4,})/);
                if (numbers) {
                    currentTrip.variants.push({
                        name: priceRaw.split(/[-:]/)[0].trim(),
                        price: parseInt(numbers[1].replace(/,/g, '')),
                        raw: priceRaw
                    });
                }
            }
        }
    }

    // Add Date
    if (dateRaw) {
        const parsed = parseDate(dateRaw);
        currentTrip.dates.push(parsed);
    }
}
if (currentTrip) trips.push(currentTrip);

// Generate Output Summary
console.log(JSON.stringify(trips, null, 2));
