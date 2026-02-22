"use client";

import { PricingBreakdown } from "@/lib/booking-utils";

interface PriceBreakdownProps {
    pricing: PricingBreakdown;
    tripTitle: string;
}

export function PriceBreakdownSummary({ pricing, tripTitle }: PriceBreakdownProps) {
    return (
        <div className="bg-white border border-gray-100 rounded-xl p-6 shadow-sm sticky top-24 transition-all hover:shadow-md">
            <h3 className="text-xl font-heading font-bold text-gray-900 mb-4 pb-2 border-b border-gray-100">Booking Summary</h3>

            <div className="mb-6">
                <h4 className="font-medium text-gray-700">{tripTitle}</h4>
                <p className="text-sm text-gray-500">7 Days • Group Trip</p>
            </div>

            <div className="space-y-3 text-sm">
                <div className="flex justify-between items-center text-gray-600">
                    <span>{pricing.quantity} Traveller{pricing.quantity > 1 ? 's' : ''} x ${pricing.basePrice}</span>
                    <span>${pricing.subtotal.toFixed(2)}</span>
                </div>

                <div className="flex justify-between items-center text-gray-600">
                    <span className="flex items-center gap-1 group relative cursor-help">
                        Service Tax (2%)
                        <span className="text-gray-400">ℹ️</span>
                        <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block w-48 bg-gray-800 text-white text-xs rounded p-2 z-50 shadow-lg">
                            Mandatory government service tax applicable on all travel bookings.
                        </div>
                    </span>
                    <span>${pricing.taxAmount.toFixed(2)}</span>
                </div>

                <div className="border-t border-gray-200 mt-4 pt-4 flex justify-between items-center font-bold text-lg text-gray-900">
                    <span>Total Payable</span>
                    <span className="text-[#1B91C9]">${pricing.total.toFixed(2)}</span>
                </div>
            </div>

            <button className="w-full mt-6 bg-[#1B91C9] hover:bg-[#157da3] text-white font-bold py-3.5 px-6 rounded-xl transition-all shadow-lg shadow-blue-500/30 transform hover:-translate-y-0.5 active:translate-y-0 text-lg">
                Secure Checkout
            </button>

            <div className="mt-4 flex justify-center items-center gap-2 text-xs text-gray-400">
                <span>🔒 SSL Encrypted</span>
                <span>•</span>
                <span>💳 Cards Accepted</span>
            </div>
        </div>
    );
}
