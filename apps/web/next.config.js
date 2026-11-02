/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@paypal/react-paypal-js'],
  async rewrites() {
    const backendUrl = process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';
    return [
      {
        source: '/api/:path*',
        destination: `${backendUrl.startsWith('http') ? backendUrl : `http://${backendUrl}`}/api/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
