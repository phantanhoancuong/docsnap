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
};

export default nextConfig;
