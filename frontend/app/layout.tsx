import "@rainbow-me/rainbowkit/styles.css";
import "./globals.css";

import type { Metadata } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import { Toaster } from "sonner";
import { CommandPalette } from "@/components/CommandPalette";
import { AsshaiHeader } from "@/components/asshai/AsshaiHeader";
import { AuroraBackdrop } from "@/components/asshai/AuroraBackdrop";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Providers } from "./providers";

const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
});

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-display",
});

export const metadata: Metadata = {
  title: "Asshai",
  description: "On-chain intent compiler on Somnia",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} ${instrumentSerif.variable}`}>
        <Providers>
          <TooltipProvider>
            <AuroraBackdrop />
            <AsshaiHeader />
            {children}
            <CommandPalette />
            <Toaster position="bottom-right" richColors={false} closeButton />
          </TooltipProvider>
        </Providers>
      </body>
    </html>
  );
}
