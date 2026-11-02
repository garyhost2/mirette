import { readFileSync } from "node:fs";
import type { NextConfig } from "next";

/** Hosts named in the data files. An open list would let anyone use the image route as a free proxy. */
function imageHosts() {
  const data = ["catalog", "features", "looks"].map((name) => readFileSync(`data/${name}.json`, "utf8")).join();
  return [...new Set([...data.matchAll(/https:\/\/([\w.-]+)\//g)].map((match) => match[1]))];
}

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  // Sellers' photos are served from this origin so WebGL may read them.
  images: { remotePatterns: imageHosts().map((hostname) => ({ protocol: "https", hostname })) },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
