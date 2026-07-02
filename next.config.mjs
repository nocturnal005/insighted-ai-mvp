/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    serverActions: {
      // Pupil-work photos are sent through Server Actions. Kept above the app-level
      // MAX_UPLOAD_MB (10MB) so multipart/base64 overhead never rejects an allowed file.
      bodySizeLimit: "15mb",
    },
  },
};

export default nextConfig;
