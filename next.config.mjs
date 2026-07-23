/** @type {import('next').NextConfig} */
const nextConfig = {
  // Contract/live harnesses use an isolated build directory so a running demo server
  // cannot hold Next's development lock and make validation wait until timeout.
  distDir: process.env.INSIGHTED_NEXT_DIST_DIR || ".next",
  typescript: {
    // Validators point this at an ephemeral child config so Next does not append their
    // process-specific dist directories to the tracked project tsconfig.
    tsconfigPath: process.env.INSIGHTED_TSCONFIG_PATH || "tsconfig.json",
  },
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
