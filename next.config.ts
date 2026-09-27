import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // The dashboard is an internal tool: never index it, and do not advertise
  // the framework to the outside world.
  poweredByHeader: false,
  async headers() {
    return [
      { source: '/:path*', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] },
    ];
  },
};

export default nextConfig;
