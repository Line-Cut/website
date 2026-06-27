import type { NextConfig } from "next";

// Public host that serves store product images (the public-read S3 bucket or its
// CloudFront/custom-domain in S3_PRODUCTS_PUBLIC_URL). Allow-listed for
// next/image. Omitted when env isn't set at build (CI/prod always sets it).
const productImageHost = (() => {
  const explicit = process.env.S3_PRODUCTS_PUBLIC_URL;
  if (explicit) {
    try {
      return new URL(explicit).hostname;
    } catch {
      /* fall through to the derived S3 host */
    }
  }
  const bucket = process.env.S3_PRODUCTS_BUCKET;
  const region = process.env.AWS_REGION;
  if (bucket && region) return `${bucket}.s3.${region}.amazonaws.com`;
  return null;
})();

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "deifkwefumgah.cloudfront.net" },
      ...(productImageHost
        ? [{ protocol: "https" as const, hostname: productImageHost }]
        : []),
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
