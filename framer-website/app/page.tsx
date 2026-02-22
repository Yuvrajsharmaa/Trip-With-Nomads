import { Hero } from "@/components/ui/Hero";
import { TripCard } from "@/components/ui/TripCard";
import { Button } from "@/components/ui/Button";

export default function Home() {
    const trips = [
        {
            title: "Kashmir: Heaven on Earth",
            image: "https://images.unsplash.com/photo-1566837945700-30057527ade0?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
            price: "$499",
            dates: "Dec 15 - Dec 22, 2026",
            description: "Experience the magic of Dal Lake and the snowy peaks of Gulmarg with a group of like-minded travelers.",
        },
        {
            title: "Winter Spiti Expedition",
            image: "https://images.unsplash.com/photo-1626621341120-d01862a95d03?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
            price: "$599",
            dates: "Jan 10 - Jan 18, 2027",
            description: "A challenging yet rewarding journey through the frozen landscapes of Spiti Valley.",
        },
        {
            title: "Tropical Thailand",
            image: "https://images.unsplash.com/photo-1506665531195-3566178f7790?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
            price: "$799",
            dates: "Feb 05 - Feb 12, 2027",
            description: "Island hopping, street food, and full moon parties. The ultimate backpacking experience.",
        },
    ];

    return (
        <main className="min-h-screen">
            <Hero />

            {/* Upcoming Trips Section */}
            <section id="upcoming-trips" className="py-24 bg-gray-50 dark:bg-black/95">
                <div className="max-w-7xl mx-auto px-6">
                    <div className="text-center mb-16">
                        <h2 className="text-4xl md:text-5xl font-bold font-heading mb-4 text-gray-900 dark:text-white">Upcoming Adventures</h2>
                        <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
                            Join us for our next set of curated group trips. Spots fill up fast!
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                        {trips.map((trip, idx) => (
                            <TripCard key={idx} {...trip} />
                        ))}
                    </div>

                    <div className="mt-16 text-center">
                        <Button variant="outline" className="text-primary-blue border-primary-blue hover:bg-primary-blue hover:text-white px-8 py-3">
                            View all trips
                        </Button>
                    </div>
                </div>
            </section>

            {/* Testimonials */}
            <section className="py-24 bg-white dark:bg-black">
                <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
                    <div>
                        <h2 className="text-4xl font-bold font-heading mb-6 leading-tight">
                            Real stories from <span className="text-primary-blue">real travelers</span>
                        </h2>
                        <p className="text-lg text-gray-600 mb-8">
                            We asked our community what makes traveling with us special. Here is what they had to say.
                        </p>
                        <div className="space-y-6">
                            {[1, 2].map((i) => (
                                <div key={i} className="bg-gray-50 p-6 rounded-xl border border-gray-100 dark:border-gray-800">
                                    <div className="flex items-center mb-4">
                                        <div className="w-10 h-10 rounded-full bg-gray-200 mr-3" />
                                        <div>
                                            <h4 className="font-bold text-gray-900">Sarah Jenkins</h4>
                                            <p className="text-sm text-gray-500">Traveled to Bali</p>
                                        </div>
                                    </div>
                                    <p className="text-gray-700 italic">"I was nervous about traveling alone, but this group made me feel like family from day one. Best decision ever!"</p>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="relative h-[600px] rounded-3xl overflow-hidden shadow-2xl">
                        {/* Abstract/Collage Image */}
                        <div className="absolute inset-0 bg-gray-200 animate-pulse" />
                        {/* Ideally an image of happy travelers group */}
                    </div>
                </div>
            </section>

            {/* Footer */}
            <footer className="bg-gray-900 text-white py-12 border-t border-gray-800">
                <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-4 gap-8">
                    <div className="col-span-1 md:col-span-2">
                        <h3 className="text-2xl font-bold font-heading mb-4">TWN</h3>
                        <p className="text-gray-400 max-w-sm">
                            Connecting solo travelers through curated group trips. Making memories, one adventure at a time.
                        </p>
                    </div>
                    <div>
                        <h4 className="font-bold mb-4">Explore</h4>
                        <ul className="space-y-2 text-gray-400">
                            <li><a href="#" className="hover:text-white">Trips</a></li>
                            <li><a href="#" className="hover:text-white">About Us</a></li>
                            <li><a href="#" className="hover:text-white">Stories</a></li>
                        </ul>
                    </div>
                    <div>
                        <h4 className="font-bold mb-4">Legal</h4>
                        <ul className="space-y-2 text-gray-400">
                            <li><a href="#" className="hover:text-white">Privacy Policy</a></li>
                            <li><a href="#" className="hover:text-white">Terms of Service</a></li>
                        </ul>
                    </div>
                </div>
                <div className="max-w-7xl mx-auto px-6 mt-12 pt-8 border-t border-gray-800 text-center text-gray-500 text-sm">
                    &copy; {new Date().getFullYear()} Trip With Nomads. All rights reserved.
                </div>
            </footer>
        </main>
    );
}
