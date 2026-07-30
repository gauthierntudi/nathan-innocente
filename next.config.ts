import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "192.168.1.64",
    "192.168.1.72",
    "192.168.1.73",
    "172.20.10.6",
  ],
  turbopack: {
    root: __dirname,
  },
  async redirects() {
    return [
      {
        source: "/home",
        destination: "/notre-univers",
        permanent: true,
      },
    ];
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
