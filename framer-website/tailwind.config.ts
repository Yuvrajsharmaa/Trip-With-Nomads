import type { Config } from "tailwindcss";

const config: Config = {
    content: [
        "./app/**/*.{js,ts,jsx,tsx,mdx}",
        "./components/**/*.{js,ts,jsx,tsx,mdx}",
    ],
    theme: {
        extend: {
            colors: {
                primary: {
                    blue: "#1B91C9",
                    DEFAULT: "#1B91C9",
                },
                background: "var(--background)",
                foreground: "var(--foreground)",
            },
            fontFamily: {
                sans: ["var(--font-dm-sans)"],
                heading: ["var(--font-manrope)"],
            },
            backgroundImage: {
                'hero-gradient': 'linear-gradient(to bottom, rgba(0,0,0,0.3), rgba(0,0,0,0.6))',
            },
        },
    },
    plugins: [],
};
export default config;
