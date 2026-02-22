import Link from 'next/link';
import { Button } from './Button';
import { Navbar } from './Navbar';

export const Hero: React.FC = () => {
    return (
        <section className="relative w-full h-screen overflow-hidden text-white flex flex-col items-center justify-center">
            {/* Background with overlay */}
            <div className="absolute inset-0 bg-hero-gradient z-10" />
            <div
                className="absolute inset-0 bg-cover bg-center bg-no-repeat z-0 scale-105 animate-kenburns"
                style={{ backgroundImage: "url('https://images.unsplash.com/photo-1506748686214-e9df14d4d9d0?ixlib=rb-4.0.3&auto=format&fit=crop&w=2070&q=80')" }}
            >
                {/* Placeholder image of a boat/sea - replace with actual asset */}
            </div>

            <Navbar />

            <div className="relative z-20 flex flex-col items-center text-center px-4 max-w-5xl mx-auto space-y-8 animate-fade-in-up">
                {/* Social Proof Badge */}
                <div className="flex items-center space-x-2 bg-white/10 backdrop-blur-md px-4 py-2 rounded-full border border-white/20 hover:bg-white/20 transition-all cursor-default">
                    <div className="flex -space-x-2">
                        {[1, 2, 3].map((i) => (
                            <div key={i} className="w-6 h-6 rounded-full bg-gray-300 border-2 border-white overflow-hidden">
                                <img src={`https://i.pravatar.cc/100?img=${i + 10}`} alt="User" />
                            </div>
                        ))}
                    </div>
                    <span className="text-sm font-medium">11,236 Joined already</span>
                </div>

                {/* Main Heading */}
                <h1 className="text-5xl md:text-7xl font-bold font-heading leading-tight tracking-tight drop-shadow-lg">
                    Travel with strangers. <br className="hidden md:block" />
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-200 to-white">Leave with a tribe.</span>
                </h1>

                {/* Subheading */}
                <p className="text-lg md:text-xl text-gray-100 max-w-2xl font-light leading-relaxed drop-shadow-md">
                    Curated group trips for people who want real conversations, genuine connections, and unforgettable adventures.
                </p>

                {/* CTA Buttons */}
                <div className="flex flex-col sm:flex-row items-center gap-4 mt-8">
                    <Button variant="primary" className="w-full sm:w-auto text-lg px-8 py-4 shadow-xl shadow-blue-900/20">
                        Explore upcoming trips
                    </Button>
                    <Button variant="outline" className="w-full sm:w-auto text-lg px-8 py-4 border-white/50 hover:border-white">
                        See how it works
                    </Button>
                </div>
            </div>

            {/* Scroll Indicator */}
            <div className="absolute bottom-10 left-1/2 transform -translate-x-1/2 z-20 animate-bounce">
                <svg className="w-6 h-6 text-white/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                </svg>
            </div>
        </section>
    );
};
