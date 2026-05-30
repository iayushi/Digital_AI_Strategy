import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  // Empty turbopack config satisfies Next.js 16's Turbopack-by-default requirement
  turbopack: {},
};

export default nextConfig;
