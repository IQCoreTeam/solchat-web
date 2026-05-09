import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  allowedDevOrigins: ['http://localhost:3000', 'http://127.0.0.1:3000'],
  reactStrictMode: true,
  transpilePackages: ['iqlabs-sdk'],
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
