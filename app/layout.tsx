import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
import "./globals.css";
import { AppProviders } from "@/components/providers";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SolChat - Decentralized Chat on Solana",
  description: "Secure, on-chain messaging powered by Solana blockchain",
  keywords: ["Solana", "blockchain", "chat", "decentralized", "Web3"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className={`${geistMono.variable} antialiased bg-black text-green-400`}>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
