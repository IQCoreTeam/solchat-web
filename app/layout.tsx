import type { Metadata } from "next";
import { Inter, Space_Grotesk } from "next/font/google";

import "./globals.css";
import { AppProviders } from "@/components/providers";

const inter = Inter({
    subsets: ['latin'],
    variable: "--font-inter",
    display: 'swap',
    weight: ['300', '400', '500', '600', '700'],
});

const spaceGrotesk = Space_Grotesk({
    subsets: ['latin'],
    variable: "--font-space-grotesk",
    display: 'swap',
    weight: ['400', '500', '600', '700'],
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://whisper.chat";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Whisper - Encrypted Messaging for People Who Care",
    template: "%s | Whisper",
  },
  description:
    "Privacy isn't optional. Whisper is encrypted-by-default messaging for people who value their digital safety. No ads. No tracking. No compromises.",
  keywords: [
    "encrypted messaging",
    "private chat",
    "secure messaging",
    "end-to-end encryption",
    "privacy-first",
    "encrypted chat app",
    "secure communication",
    "private messaging",
    "whisper chat",
    "encrypted conversations",
    "privacy messaging",
    "secure chat",
    "encrypted app",
    "privacy app",
    "anonymous messaging",
    "encrypted communication",
  ],
  authors: [{ name: "Whisper" }],
  creator: "Whisper",
  publisher: "Whisper",
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
    siteName: "Whisper",
    title: "Whisper - Say Anything. Whisper Keeps It Safe.",
    description:
      "Privacy isn't optional. Encrypted messaging for people who care. No ads. No tracking. No compromises. Your conversations belong to you.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Whisper - Encrypted Messaging",
    description:
      "The quietest app in a loud world. Privacy-first encrypted messaging.",
    creator: "@whisperapp",
    site: "@whisperapp",
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
  applicationName: "Whisper",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Whisper",
  },
  formatDetection: {
    telephone: false,
  },
  category: "social",
  classification: "Encrypted Messaging Application",
  other: {
    "theme-color": "#0A0A0F",
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
    name: "Whisper",
    description:
      "Privacy isn't optional. Whisper is encrypted-by-default messaging for people who value their digital safety. No ads. No tracking. No compromises.",
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
      name: "Whisper",
    },
    screenshot: `${siteUrl}/og-image.svg`,
    softwareVersion: "1.0",
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: "5",
      ratingCount: "1",
    },
    featureList: [
      "End-to-end encryption",
      "Private messaging",
      "Secure communication",
      "No ads or tracking",
      "Privacy-first design",
      "Encrypted conversations",
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
      <body className={`${inter.variable} ${spaceGrotesk.variable} antialiased`} style={{ backgroundColor: 'var(--midnight-black)', color: 'var(--ghost-white)' }}>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
