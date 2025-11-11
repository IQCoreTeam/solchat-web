import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
      crypto: false,
    };
    return config;
  },
  // Turbopack configuration (Next.js 16+)
  turbopack: {},
  // Enable experimental features for better performance
  experimental: {
    optimizePackageImports: ['@solana/web3.js', '@solana/wallet-adapter-react'],
  },
};

export default nextConfig;
