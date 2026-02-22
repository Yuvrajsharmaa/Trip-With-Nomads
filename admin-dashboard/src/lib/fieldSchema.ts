export type FieldImpact = 'critical' | 'high' | 'medium' | 'low';
export type FieldType = 'string' | 'number' | 'boolean' | 'formattedText' | 'image' | 'slug';

export interface FieldMeta {
    label: string;
    type: FieldType;
    required: boolean;
    impact: FieldImpact;
    warning: string;
    group?: string;
}

export const COLLECTION_ID = 'Z1Bphf6oI'; // Domestic Trips

export const FRAMER_FIELDS: Record<string, FieldMeta> = {
    // --- Identity (critical, required) ---
    slug: {
        label: 'Slug / URL Path',
        type: 'slug',
        required: true,
        impact: 'critical',
        warning: 'BREAKING CHANGE: Changing the slug changes the live URL. Anyone with a bookmarked or shared link (e.g. /domestic-trips/spiti-valley) will get a 404. Add a Framer redirect before changing this.',
        group: 'Identity',
    },
    edpZYc3f0: {
        label: 'Title',
        type: 'string',
        required: true,
        impact: 'high',
        warning: 'The trip title is shown on listing cards, the detail page hero, booking confirmation emails, and Open Graph previews.',
        group: 'Identity',
    },
    sOpVBzQ8v: {
        label: 'Trip ID (Supabase UUID)',
        type: 'string',
        required: true,
        impact: 'critical',
        warning: 'This is the foreign key linking Framer to Supabase. Changing it breaks pricing lookups, date variants, and the entire booking flow for this trip.',
        group: 'Identity',
    },

    // --- Core Info (medium–high) ---
    L131_KPPt: {
        label: 'Starting Price (₹)',
        type: 'number',
        required: true,
        impact: 'medium',
        warning: 'Shown on listing cards and the detail page. Does NOT affect actual booking price — that lives in the Supabase trip_variants table.',
        group: 'Core Info',
    },
    LUnTv710m: {
        label: 'Days',
        type: 'string',
        required: true,
        impact: 'medium',
        warning: 'Displayed on trip cards (e.g. "8 Days"). Purely informational — does not affect booking or pricing.',
        group: 'Core Info',
    },
    fhY5p3Uv0: {
        label: 'Nights',
        type: 'string',
        required: true,
        impact: 'medium',
        warning: 'Displayed on trip cards alongside Days. Purely informational.',
        group: 'Core Info',
    },
    jCUvfD0Og: {
        label: 'Route',
        type: 'string',
        required: true,
        impact: 'medium',
        warning: 'e.g. "Delhi - Delhi". Shown on trip cards as departure/return city info.',
        group: 'Core Info',
    },

    // --- Flags ---
    aWGnCiNqy: {
        label: 'Is International',
        type: 'boolean',
        required: false,
        impact: 'medium',
        warning: 'Affects which trip listing this appears in. Toggling this may move the trip from Domestic to International filters.',
        group: 'Flags',
    },
    sPkd1cvAB: {
        label: 'Is Featured',
        type: 'boolean',
        required: false,
        impact: 'low',
        warning: 'Appears in the Featured section on the homepage if enabled.',
        group: 'Flags',
    },
    s_q7hqKWw: {
        label: 'Is Draft (Hidden)',
        type: 'boolean',
        required: false,
        impact: 'high',
        warning: 'When enabled, this trip is UNPUBLISHED and invisible on the live site. Toggling this will immediately remove or restore the trip page.',
        group: 'Flags',
    },

    // --- Content ---
    bcIz1zCfP: {
        label: 'Description',
        type: 'formattedText',
        required: true,
        impact: 'medium',
        warning: 'Main trip description shown below the hero on the detail page. Supports rich HTML.',
        group: 'Content',
    },
    ehDqi1QjF: {
        label: 'Inclusions & Exclusions',
        type: 'formattedText',
        required: true,
        impact: 'medium',
        warning: 'What\'s included and excluded in the package price. Shown as a formatted list on the trip page.',
        group: 'Content',
    },

    // --- Images ---
    obqBLk4fH: { label: 'Image 1 (Hero)', type: 'image', required: false, impact: 'medium', warning: 'Primary hero/OG image.', group: 'Images' },
    UloSTh_Vi: { label: 'Image 2', type: 'image', required: false, impact: 'low', warning: 'Gallery image.', group: 'Images' },
    BVBUTmwRM: { label: 'Image 3', type: 'image', required: false, impact: 'low', warning: 'Gallery image.', group: 'Images' },
    tIwXmI0IB: { label: 'Image 4', type: 'image', required: false, impact: 'low', warning: 'Gallery image.', group: 'Images' },
    eEuJi4Ira: { label: 'Image 5', type: 'image', required: false, impact: 'low', warning: 'Gallery image.', group: 'Images' },
    hzy63_bNb: { label: 'Image 6', type: 'image', required: false, impact: 'low', warning: 'Gallery image.', group: 'Images' },
    IFgQzXQU4: { label: 'Image 7', type: 'image', required: false, impact: 'low', warning: 'Gallery image.', group: 'Images' },
    YeAyVr5aE: { label: 'Image 8', type: 'image', required: false, impact: 'low', warning: 'Gallery image.', group: 'Images' },
    oin7WhTZ6: { label: 'Image 9', type: 'image', required: false, impact: 'low', warning: 'Gallery image.', group: 'Images' },
    cFgqIQWUd: { label: 'Image 10', type: 'image', required: false, impact: 'low', warning: 'Gallery image.', group: 'Images' },
    hsrE7EFWe: { label: 'Image 11', type: 'image', required: false, impact: 'low', warning: 'Gallery image.', group: 'Images' },
    qSDkgRgIk: { label: 'Image 12', type: 'image', required: false, impact: 'low', warning: 'Gallery image.', group: 'Images' },
    eSk6aiAgh: { label: 'Image 13', type: 'image', required: false, impact: 'low', warning: 'Gallery image.', group: 'Images' },

    // --- Itinerary (pairs of title + body for each day) ---
    afXAZM8_y: { label: 'Day 1 Title', type: 'string', required: false, impact: 'low', warning: 'Itinerary day title.', group: 'Itinerary' },
    d2NsTsvCt: { label: 'Day 1 Detail', type: 'formattedText', required: false, impact: 'low', warning: 'Itinerary day detail.', group: 'Itinerary' },
    Vd9JMFXup: { label: 'Day 2 Title', type: 'string', required: false, impact: 'low', warning: 'Itinerary day title.', group: 'Itinerary' },
    fRipqFemz: { label: 'Day 2 Detail', type: 'formattedText', required: false, impact: 'low', warning: 'Itinerary day detail.', group: 'Itinerary' },
    HQ9UFTOGo: { label: 'Day 3 Title', type: 'string', required: false, impact: 'low', warning: 'Itinerary day title.', group: 'Itinerary' },
    Pb90Dem6p: { label: 'Day 3 Detail', type: 'formattedText', required: false, impact: 'low', warning: 'Itinerary day detail.', group: 'Itinerary' },
    jK9CbYCEF: { label: 'Day 4 Title', type: 'string', required: false, impact: 'low', warning: 'Itinerary day title.', group: 'Itinerary' },
    iIxDBOr6F: { label: 'Day 4 Detail', type: 'formattedText', required: false, impact: 'low', warning: 'Itinerary day detail.', group: 'Itinerary' },
    NKTGgIGtX: { label: 'Day 5 Title', type: 'string', required: false, impact: 'low', warning: 'Itinerary day title.', group: 'Itinerary' },
    F7WclM2Z5: { label: 'Day 5 Detail', type: 'formattedText', required: false, impact: 'low', warning: 'Itinerary day detail.', group: 'Itinerary' },
    JvBqIY3SV: { label: 'Day 6 Title', type: 'string', required: false, impact: 'low', warning: 'Itinerary day title.', group: 'Itinerary' },
    DfxWgxvqj: { label: 'Day 6 Detail', type: 'formattedText', required: false, impact: 'low', warning: 'Itinerary day detail.', group: 'Itinerary' },
    K9KsOdQpr: { label: 'Day 7 Title', type: 'string', required: false, impact: 'low', warning: '', group: 'Itinerary' },
    CxbLu8xrT: { label: 'Day 7 Detail', type: 'formattedText', required: false, impact: 'low', warning: '', group: 'Itinerary' },
    cpBMgOg4p: { label: 'Day 8 Title', type: 'string', required: false, impact: 'low', warning: '', group: 'Itinerary' },
    RjrGIirCO: { label: 'Day 8 Detail', type: 'formattedText', required: false, impact: 'low', warning: '', group: 'Itinerary' },
    u8VRoVI8x: { label: 'Day 9 Title', type: 'string', required: false, impact: 'low', warning: '', group: 'Itinerary' },
    G6Ggx4hTT: { label: 'Day 9 Detail', type: 'formattedText', required: false, impact: 'low', warning: '', group: 'Itinerary' },
    l1qHMK51W: { label: 'Day 10 Title', type: 'string', required: false, impact: 'low', warning: '', group: 'Itinerary' },
    zGUv1LIaQ: { label: 'Day 10 Detail', type: 'formattedText', required: false, impact: 'low', warning: '', group: 'Itinerary' },
};

export const IMPACT_COLOR: Record<FieldImpact, string> = {
    critical: '#dc2626',
    high: '#ea580c',
    medium: '#d97706',
    low: '#16a34a',
};

export const IMPACT_LABEL: Record<FieldImpact, string> = {
    critical: '🔴 Critical',
    high: '🟠 High',
    medium: '🟡 Medium',
    low: '🟢 Low',
};

export const REQUIRED_FIELDS = Object.entries(FRAMER_FIELDS)
    .filter(([, meta]) => meta.required)
    .map(([id]) => id);
