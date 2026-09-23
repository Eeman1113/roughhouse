import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  // GitHub Pages serves under /<repo>; set NEXT_PUBLIC_BASE_PATH="/<repo>" in CI
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || undefined,
  turbopack: { root: __dirname },
};

export default nextConfig;
