"use client";

import { Traveller } from "@/lib/booking-utils";

interface TravellerFormProps {
    traveller: Traveller;
    index: number;
    onUpdate: (id: string, updates: Partial<Traveller>) => void;
    onRemove: (id: string) => void;
    canRemove: boolean;
}

export function TravellerForm({ traveller, index, onUpdate, onRemove, canRemove }: TravellerFormProps) {

    const handleToggleSelf = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) {
            // Assuming 'Self' is pre-filled from auth context in real app
            onUpdate(traveller.id, { isSelf: true, name: "Current User", age: 28 });
        } else {
            onUpdate(traveller.id, { isSelf: false, name: "", age: "" });
        }
    };

    return (
        <div className="bg-white border border-gray-100 rounded-xl p-6 shadow-sm mb-4 animate-fade-in-up">
            <div className="flex justify-between items-center mb-4">
                <h3 className="font-heading font-bold text-lg text-gray-900">
                    Traveller {index + 1}
                </h3>
                {canRemove && (
                    <button
                        type="button"
                        onClick={() => onRemove(traveller.id)}
                        className="text-red-500 text-sm hover:text-red-700 font-medium"
                    >
                        Remove
                    </button>
                )}
            </div>

            {index === 0 && (
                <div className="mb-4 flex items-center">
                    <input
                        type="checkbox"
                        id={`self-${traveller.id}`}
                        checked={traveller.isSelf}
                        onChange={handleToggleSelf}
                        className="w-4 h-4 text-primary-blue rounded border-gray-300 focus:ring-primary-blue"
                    />
                    <label htmlFor={`self-${traveller.id}`} className="ml-2 text-sm text-gray-700">
                        I am this traveller (Fill with my info)
                    </label>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                    <input
                        type="text"
                        value={traveller.name}
                        onChange={(e) => onUpdate(traveller.id, { name: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-blue/20 focus:border-primary-blue outline-none transition-colors"
                        placeholder="e.g. John Doe"
                        required
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Age</label>
                    <input
                        type="number"
                        value={traveller.age}
                        onChange={(e) => onUpdate(traveller.id, { age: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-blue/20 focus:border-primary-blue outline-none transition-colors"
                        placeholder="e.g. 25"
                        required
                        min="18" // Assuming explicit min age policy for booking?
                    />
                </div>
            </div>
        </div>
    );
}
