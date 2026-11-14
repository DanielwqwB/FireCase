/** @type {import('next').NextConfig} */
const nextConfig = { distDir: process.env.FIRECASE_NEXT_DIST_DIR || (process.env.NODE_ENV === 'development' ? '.next-dev' : '.next-production') };
module.exports = nextConfig;
