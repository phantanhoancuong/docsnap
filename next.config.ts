import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: process.env.DEV_ORIGINS?.split(",") ?? [],

  turbopack: {
    rules: {
      "*.svg": {
        loaders: ["turbopack-inline-svg-loader"],
        as: "*.js",
      },
    },
  },

  env: {
    NEXT_PUBLIC_VERSION: process.env.npm_package_version,
  },
};

export default nextConfig;
