import Link from 'next/link';
import { Button } from './Button';

export const Navbar: React.FC = () => {
    return (
        <nav className="fixed top-0 left-0 w-full z-50 transition-all duration-300 backdrop-blur-md bg-white/10 dark:bg-black/20 border-b border-white/10">
            <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
                {/* Logo */}
                <Link href="/" className="text-2xl font-bold text-white tracking-tight">
                    <span className="font-heading">TWN</span>
                </Link>

                {/* Navigation Links */}
                <div className="hidden md:flex items-center space-x-8">
                    {["Group trips", "Domestic trips", "Corporate trips", "About us"].map((item) => (
                        <Link
                            key={item}
                            href={`#${item.toLowerCase().replace(" ", "-")}`}
                            className="text-white/90 hover:text-white font-medium text-sm transition-colors relative group"
                        >
                            {item}
                            <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-white transition-all group-hover:w-full" />
                        </Link>
                    ))}
                </div>

                {/* CTA */}
                <div className="flex items-center space-x-4">
                    <Button variant="primary" className="text-sm px-5 py-2">
                        Nomads club
                    </Button>
                </div>

                {/* Mobile Menu Toggle (Simplified) */}
                <button className="md:hidden text-white p-2">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                    </svg>
                </button>
            </div>
        </nav>
    );
};
