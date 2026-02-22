export interface Trip {
    id: string;
    title: string;
    price: number;
    dates: string;
    image: string;
}

export interface Traveller {
    id: string; // unique ID for frontend tracking
    isSelf: boolean;
    name: string;
    age: number | string;
    email?: string;
    phone?: string;
}

export interface PricingBreakdown {
    basePrice: number;
    quantity: number;
    subtotal: number;
    taxAmount: number; // 2%
    total: number;
}

export const TAX_RATE = 0.02;

export function calculateTripPricing(basePrice: number, travellers: Traveller[]): PricingBreakdown {
    const quantity = travellers.length;
    const subtotal = basePrice * quantity;
    const taxAmount = Number((subtotal * TAX_RATE).toFixed(2));
    const total = Number((subtotal + taxAmount).toFixed(2));

    return {
        basePrice,
        quantity,
        subtotal,
        taxAmount,
        total
    };
}

// Mock Data for trips available for booking
export const TRIPS: Record<string, Trip> = {
    "kashmir": {
        id: "kashmir",
        title: "Kashmir: Heaven on Earth",
        price: 499,
        dates: "Dec 15 - Dec 22, 2026",
        image: "https://images.unsplash.com/photo-1566837945700-30057527ade0?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80"
    },
    "spiti": {
        id: "spiti",
        title: "Winter Spiti Expedition",
        price: 599,
        dates: "Jan 10 - Jan 18, 2027",
        image: "https://images.unsplash.com/photo-1626621341120-d01862a95d03?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80"
    },
    "thailand": {
        id: "thailand",
        title: "Tropical Thailand",
        price: 799,
        dates: "Feb 05 - Feb 12, 2027",
        image: "https://images.unsplash.com/photo-1506665531195-3566178f7790?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80"
    }
};
