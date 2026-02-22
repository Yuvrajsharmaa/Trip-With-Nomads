import Image from 'next/image';
import { Button } from './Button';

interface TripCardProps {
    title: string;
    image: string;
    price: string;
    dates: string;
    description: string;
}

export const TripCard: React.FC<TripCardProps> = ({ title, image, price, dates, description }) => {
    return (
        <div className="group relative overflow-hidden rounded-2xl shadow-xl hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-2 bg-white flex flex-col h-full border border-gray-100 dark:border-gray-800">
            <div className="relative h-64 overflow-hidden">
                <Image
                    src={image}
                    alt={title}
                    fill
                    className="object-cover transition-transform duration-500 group-hover:scale-110"
                />
                <div className="absolute top-4 left-4 bg-white/90 backdrop-blur-sm px-3 py-1 rounded-full text-xs font-bold text-gray-900 shadow-sm uppercase tracking-wide">
                    Upcoming
                </div>
            </div>
            <div className="p-6 flex flex-col flex-grow bg-white dark:bg-gray-900 z-10">
                <div className="flex justify-between items-start mb-2">
                    <h3 className="font-heading font-bold text-xl text-gray-900 dark:text-white leading-tight">{title}</h3>
                    <span className="text-primary-blue font-bold text-lg">{price}</span>
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4 font-medium flex items-center">
                    <svg className="w-4 h-4 mr-1 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                    {dates}
                </p>
                <p className="text-gray-600 dark:text-gray-300 text-sm mb-6 line-clamp-3">
                    {description}
                </p>
                <div className="mt-auto">
                    <Button variant="secondary" className="w-full justify-center group-hover:bg-primary-blue group-hover:text-white group-hover:border-transparent transition-colors">
                        View Details
                        <svg className="ml-2 w-4 h-4 transition-transform group-hover:translate-x-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
                    </Button>
                </div>
            </div>
        </div>
    );
};
