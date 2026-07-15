import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.1.72", "192.168.1.73"],
  turbopack: {
    root: __dirname,
  },
  async rewrites() {
    return [
      {
        source: "/save",
        destination: "/login",
      },
    ];
  },
};

export default nextConfig;
