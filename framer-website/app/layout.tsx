import type { Metadata } from "next";
import { Manrope, DM_Sans } from "next/font/google";
import "./globals.css";

const manrope = Manrope({
    subsets: ["latin"],
    variable: "--font-manrope",
    weight: ["400", "500", "700"],
});

const dmSans = DM_Sans({
    subsets: ["latin"],
    variable: "--font-dm-sans",
    weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
    title: "Trip with Nomads (Clone)",
    description: "Travel with strangers. Leave with a tribe.",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en">
            <body
                className={`${manrope.variable} ${dmSans.variable} antialiased bg-background text-foreground`}
            >
                {children}
            </body>
        </html>
    );
}
