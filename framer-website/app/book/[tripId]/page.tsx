"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { TRIPS, calculateTripPricing, Traveller } from "@/lib/booking-utils";
import { PriceBreakdownSummary } from "@/components/booking/PriceBreakdown";

interface TravellerFormProps {
    id: string; // Add id to props matching Traveller type
    index: number;
    onUpdate: (id: string, updates: Partial<Traveller>) => void;
    onRemove: (id: string) => void;
    canRemove: boolean;
}

// Add simplified TravellerForm inside this file for simplicity as components are not yet imported
function TravellerForm({ id, index, onUpdate, onRemove, canRemove }: TravellerFormProps) {
    return (
        <div className="bg-white border border-gray-100 rounded-xl p-6 shadow-sm mb-4 animate-fade-in-up">
            <div className="flex justify-between items-center mb-4">
                <h3 className="font-heading font-bold text-lg text-gray-900 border-b border-gray-100 pb-2 mb-2 w-full flex justify-between">
                    <span>Traveller {index + 1}</span>
                    {canRemove && (
                        <button
                            type="button"
                            onClick={() => onRemove(id)}
                            className="text-red-500 text-sm hover:text-red-700 font-medium"
                        >
                            Remove
                        </button>
                    )}
                </h3>
            </div>

            {/* Self Checkbox Logic */}
            {index === 0 && (
                <label className="flex items-center space-x-2 text-sm text-gray-600 mb-4 cursor-pointer select-none">
                    <input type="checkbox" className="form-checkbox text-blue-600 rounded" />
                    <span>I am this traveller (Auto-fill)</span>
                </label>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                    <label className="text-sm font-medium text-gray-700">Full Name</label>
                    <input
                        type="text"
                        className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-100 focus:border-blue-500 outline-none transition-all"
                        placeholder="e.g. John Doe"
                        required
                    />
                </div>
                <div className="space-y-1">
                    <label className="text-sm font-medium text-gray-700">Age</label>
                    <input
                        type="number"
                        className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-100 focus:border-blue-500 outline-none transition-all"
                        placeholder="e.g. 25"
                        required
                        min="18"
                    />
                </div>
            </div>
        </div>
    );
}

export default function BookingPage() {
    const params = useParams();
    const tripId = params.tripId as string;
    const trip = TRIPS[tripId] || TRIPS["kashmir"]; // Fallback for demo if id not found

    const [travellers, setTravellers] = useState<Traveller[]>([
        { id: "1", isSelf: true, name: "Current User", age: 28 } // Default first traveller
    ]);

    const pricing = calculateTripPricing(trip.price, travellers);

    const addTraveller = () => {
        const newId = (travellers.length + 1).toString();
        setTravellers([...travellers, { id: newId, isSelf: false, name: "", age: "" }]);
    };

    const removeTraveller = (id: string) => {
        if (travellers.length <= 1) return;
        setTravellers(travellers.filter(t => t.id !== id));
    };

    const updateTraveller = (id: string, updates: Partial<Traveller>) => {
        setTravellers(travellers.map(t => t.id === id ? { ...t, ...updates } : t));
    };

    return (
        <div className="min-h-screen bg-gray-50 text-gray-900 font-sans">
            <nav className="bg-white border-b border-gray-100 py-4 px-6 fixed w-full top-0 z-50">
                <div className="max-w-7xl mx-auto flex justify-between items-center">
                    <Link href="/" className="font-heading font-bold text-2xl text-primary-blue tracking-tight">TWN</Link>
                    <div className="text-sm text-gray-500">Secure Booking</div>
                </div>
            </nav>

            <div className="max-w-6xl mx-auto px-6 pt-28 pb-12 grid grid-cols-1 lg:grid-cols-3 gap-12">
                {/* Left Column: Traveller Details */}
                <div className="lg:col-span-2">
                    <h1 className="text-3xl font-heading font-bold mb-2">Book Your Trip</h1>
                    <p className="text-gray-600 mb-8">Complete your details to secure your spot for <span className="font-bold text-primary-blue">{trip.title}</span>.</p>

                    <div className="space-y-6">
                        {travellers.map((traveller, index) => (
                            <TravellerForm
                                key={traveller.id}
                                id={traveller.id} // Pass specific ID
                                index={index}
                                onUpdate={updateTraveller}
                                onRemove={removeTraveller}
                                canRemove={travellers.length > 1}
                            />
                        ))}
                    </div>

                    <button
                        onClick={addTraveller}
                        className="mt-6 w-full py-3 border-2 border-dashed border-gray-300 rounded-xl text-gray-500 font-medium hover:border-gray-400 hover:text-gray-700 hover:bg-white transition-all flex items-center justify-center gap-2 group"
                    >
                        <span className="bg-gray-200 rounded-full w-6 h-6 flex items-center justify-center text-gray-600 group-hover:bg-gray-300">+</span>
                        Add Another Traveller
                    </button>
                </div>

                {/* Right Column: Pricing Summary */}
                <div className="lg:col-span-1">
                    <PriceBreakdownSummary pricing={pricing} tripTitle={trip.title} />

                    <div className="mt-8 bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm text-blue-800">
                        <p className="font-bold mb-1">💡 Good to know</p>
                        <ul className="list-disc pl-4 space-y-1 text-blue-700/80">
                            <li>Free cancellation up to 7 days before.</li>
                            <li>No hidden fees beyond the 2% tax.</li>
                            <li>Instant confirmation via email.</li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    );
}
