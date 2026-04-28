const crypto = require('node:crypto')

const bundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
})

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Enable optimized package imports
    optimizePackageImports: [
      'lucide-react',
      'clsx',
      'tailwind-merge',
      'date-fns',
      'framer-motion',
      'recharts',
    ],
    // Enable server components external packages
    serverComponentsExternalPackages: [
      '@lancedb/lancedb',
      '@xenova/transformers',
      'sharp',
    ],
  },

  // Images configuration
  images: {
    domains: [
      'localhost',
      // Add your image domains here
    ],
    formats: ['image/webp', 'image/avif'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },

  // Webpack configuration for custom optimizations
  webpack: (config, { isServer, dev, webpack }) => {
    // Resolve extensions
    config.resolve.extensions = [
      '.tsx',
      '.ts',
      '.jsx',
      '.js',
      '.json',
      '.wasm',
    ]

    // Add custom webpack rules for large models
    config.module.rules.push({
      test: /\.onnx$/,
      type: 'asset/resource',
    })

    // Optimize chunks for better caching
    if (!dev && !isServer) {
      config.optimization.splitChunks = {
        chunks: 'all',
        cacheGroups: {
          default: false,
          vendors: false,
          framework: {
            chunks: 'all',
            name: 'framework',
            test: /[\\/]node_modules[\\/](react|react-dom|scheduler|prop-types|use-subscription)[\\/]/,
            priority: 40,
            enforce: true,
          },
          lib: {
            test(module) {
              return (
                module.size() > 160000 &&
                /node_modules[/\\]/.test(module.identifier())
              )
            },
            name(module) {
              const hash = crypto
                .createHash('sha1')
                .update(module.identifier())
                .digest('hex')
                .substr(0, 8)
              return `lib-${hash}`
            },
            priority: 30,
            minChunks: 1,
            reuseExistingChunk: true,
          },
          commons: {
            name: 'commons',
            minChunks: 2,
            priority: 20,
          },
          shared: {
            name: 'shared',
            chunks: 'all',
            priority: 10,
            test: /[\\/]node_modules[\\/]/,
            enforce: true,
          },
          entities: {
            test: /[\\/]entities[\\/]/,
            name: 'entities',
            chunks: 'all',
            priority: 15,
          },
          features: {
            test: /[\\/]features[\\/]/,
            name: 'features',
            chunks: 'all',
            priority: 20,
          },
          pages: {
            test: /[\\/]pages[\\/]/,
            name: 'pages',
            chunks: 'all',
            priority: 20,
          },
        },
      }
    }

    // Ignore worker files for client-side bundle
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        crypto: false,
        stream: false,
        url: false,
        zlib: false,
        http: false,
        https: false,
        assert: false,
        os: false,
        path: false,
      }
    }

    return config
  },

  // Environment variables
  env: {
    CUSTOM_KEY: process.env.CUSTOM_KEY,
  },

  // Redirects
  async redirects() {
    return [
      {
        source: '/home',
        destination: '/',
        permanent: true,
      },
    ]
  },

  // Headers for security and performance
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'origin-when-cross-origin',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
        ],
      },
      {
        source: '/models/(.*)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      {
        source: '/_next/static/(.*)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ]
  },

  // React strict mode
  reactStrictMode: true,

  // SWC minification
  swcMinify: true,

  // Output configuration
  output: 'standalone',

  // Power headers
  poweredByHeader: false,

  // Compression
  compress: true,

  // Generate ETags
  generateEtags: true,

  // Enable trailing slash
  trailingSlash: false,

  // Configure page extensions
  pageExtensions: ['ts', 'tsx', 'js', 'jsx', 'md', 'mdx'],

  // Experimental features
  experimental: {
    // ...previous experimental config
    optimizeCss: true,
    optimizeServerReact: true,
    scrollRestoration: true,
    largePageDataBytes: 128 * 1000, // 128KB
  },
}

module.exports = bundleAnalyzer(nextConfig)
