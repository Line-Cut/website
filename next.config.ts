import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "deifkwefumgah.cloudfront.net" },
    ],
  },
  // Ship the Hebrew-capable TTF used by the order metadata PDF generator
  // (lib/pdf/order-metadata-pdf.ts reads it via fs at runtime) with the
  // serverless functions. Without this, the font isn't traced into the bundle.
  outputFileTracingIncludes: {
    "/**": ["./lib/pdf/fonts/DejaVuSans.ttf"],
  },
};

export default nextConfig;
