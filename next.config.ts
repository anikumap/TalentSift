import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdf-parse", "bcryptjs"],
  experimental: { serverActions: { bodySizeLimit: "6mb" } },
};

export default nextConfig;
