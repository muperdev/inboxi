import type { NextConfig } from "next";

const distDir = process.env.MAILRIGHT_DIST_DIR;

const nextConfig: NextConfig = {
  ...(distDir ? { distDir, output: "standalone" as const } : {}),
  allowedDevOrigins: ["127.0.0.1"],
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
