import React from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: ButtonVariant;
    children: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({ variant = 'primary', children, className = '', ...props }) => {
    const baseStyles = "px-6 py-3 rounded-lg font-medium transition-all duration-200 transform hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed";

    const variants = {
        primary: "bg-[#1B91C9] text-white hover:bg-[#157da3] shadow-md hover:shadow-lg",
        secondary: "bg-white text-black border border-gray-200 hover:bg-gray-50",
        outline: "border-2 border-white text-white hover:bg-white/10 backdrop-blur-sm",
        ghost: "text-gray-700 hover:bg-gray-100",
    };

    return (
        <button
            className={`${baseStyles} ${variants[variant]} ${className}`}
            {...props}
        >
            {children}
        </button>
    );
};
