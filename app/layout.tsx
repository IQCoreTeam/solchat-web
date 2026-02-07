import type { Metadata } from "next";
// import { Geist_Mono } from "next/font/google";

import "./globals.css";
import { AppProviders } from "@/components/providers";
import localFont from "next/font/local";

const bitArrayA2 = localFont({
    src: './fonts/bitArray-A2.ttf',
    variable: "--font-bitarray",
    display: 'swap',
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://solchat.iqlabs.dev";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "SolChat by IQ Labs - Fully Decentralized On-Chain Chat on Solana",
    template: "%s | SolChat",
  },
  description:
    "SolChat is a completely decentralized, censorship-resistant chat application built on Solana blockchain. Send on-chain messages with cryptographic security, no central servers, and full ownership of your data. Powered by IQ Labs.",
  keywords: [
    "Solana",
    "blockchain",
    "decentralized chat",
    "Web3 messaging",
    "on-chain chat",
    "crypto messaging",
    "dApp",
    "IQ Labs",
    "censorship-resistant",
    "peer-to-peer chat",
    "Solana dApp",
    "decentralized application",
    "blockchain messaging",
    "Web3",
    "cryptocurrency",
    "smart contracts",
    "Solana chat",
    "trustless messaging",
  ],
  authors: [{ name: "IQ Labs", url: "https://iqlabs.io" }],
  creator: "IQ Labs",
  publisher: "IQ Labs",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  alternates: {
    canonical: siteUrl,
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: siteUrl,
    siteName: "SolChat",
    title: "SolChat by IQ Labs - Fully Decentralized Messanging on Solana",
    description:
      "Experience truly decentralized messaging on Solana. Every message is stored on-chain with full transparency and security. No servers, just pure blockchain communication.",
  },
  twitter: {
    card: "summary_large_image",
    title: "SolChat by IQ Labs - Decentralized On-Chain Chat",
    description:
      "Chat on Solana blockchain. Fully decentralized, messaging with cryptographic security.",
    creator: "@iqlabs",
    site: "@solchat",
  },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    apple: [{ url: "/apple-icon.svg", type: "image/svg+xml" }],
    other: [
      {
        rel: "mask-icon",
        url: "/icon.svg",
      },
    ],
  },
  manifest: "/manifest.json",
  applicationName: "SolChat",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "SolChat",
  },
  formatDetection: {
    telephone: false,
  },
  category: "technology",
  classification: "Blockchain Application",
  other: {
    "theme-color": "#002100",
    "color-scheme": "dark",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "SolChat",
    description:
      "SolChat is a completely decentralized, chat application built on Solana blockchain. Send on-chain messages with cryptographic security, no central servers, and full ownership of your data.",
    url: siteUrl,
    applicationCategory: "CommunicationApplication",
    operatingSystem: "Web",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
    creator: {
      "@type": "Organization",
      name: "IQ Labs",
      url: "https://iqlabs.io",
    },
    screenshot: `${siteUrl}/icon.svg`,
    softwareVersion: "1.0",
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: "5",
      ratingCount: "1",
    },
    featureList: [
      "Decentralized messaging",
      "On-chain data storage",
      "Censorship-resistant",
      "Solana blockchain integration",
      "Wallet authentication",
      "End-to-end security",
    ],
  };

  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className={`${bitArrayA2.variable} antialiased bg-black text-green-400`}>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
