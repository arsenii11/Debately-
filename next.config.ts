import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /** Smaller Docker image: copies only traced server files + static assets */
  output: "standalone",
};

export default nextConfig;
