/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    // `sharp` is a native module used only in server-side AI preprocessing; keep it
    // external so the bundler never tries to trace/inline its binaries.
    serverComponentsExternalPackages: ["sharp"],
    serverActions: {
      // Pupil-work photos are sent through Server Actions as data URLs.
      bodySizeLimit: "8mb",
    },
  },
};

export default nextConfig;
