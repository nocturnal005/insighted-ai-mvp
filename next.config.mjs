/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    serverActions: {
      // Pupil-work photos are sent through Server Actions as data URLs.
      bodySizeLimit: "8mb",
    },
  },
};

export default nextConfig;
