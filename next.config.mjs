/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    // The landing hero is stable and is already served through next/image; a longer
    // variant cache avoids repeated image work on slower devices and repeat visits.
    minimumCacheTTL: 86400,
  },
  experimental: {
    optimizePackageImports: ["lucide-react"],
    serverActions: {
      // Pupil-work photos are sent through Server Actions. Kept above the app-level
      // MAX_UPLOAD_MB (10MB) so multipart/base64 overhead never rejects an allowed file.
      bodySizeLimit: "15mb",
    },
  },
};

export default nextConfig;
