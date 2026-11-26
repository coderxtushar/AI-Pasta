import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    // The compare page used to live at /home.
    return [{ source: "/home", destination: "/", permanent: true }];
  },
};

export default nextConfig;
