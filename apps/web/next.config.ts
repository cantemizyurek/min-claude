import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@min-claude/shared"],
  allowedDevOrigins: ["localhost"],
};

export default nextConfig;
