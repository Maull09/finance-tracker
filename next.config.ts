import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["unamicably-miracidial-jenette.ngrok-free.dev"],
  turbopack: {
    root: process.cwd(),
  },
  async headers() {
    return [
      "/dashboard/:path*",
      "/sign-in",
      "/sign-up",
      "/auth/:path*",
      "/api/:path*",
    ].map((source) => ({
      source,
      headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
    }))
  },
}

export default nextConfig
