/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Lets a verification build run beside `next dev` without clobbering it.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
