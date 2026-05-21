import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@precall/shared", "@precall/worker"],
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
};

export default nextConfig;
