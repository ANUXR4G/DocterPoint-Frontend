/** @type {import('next').NextConfig} */

const nextConfig = {
  poweredByHeader: false,
  compress: true,
  experimental: {
    optimizePackageImports: ["@tabler/icons-react", "lucide-react", "date-fns"],
  },
  async redirects() {
    return [
      // Patients is a standalone page at /doctor/patients.
      // Do not redirect it (or legacy paths) to Settings — that loops with middleware.
      {
        source: "/doctor/appointments/patients",
        destination: "/doctor/patients",
        permanent: false,
      },
      {
        source: "/patient/appointments",
        destination: "/patient/bookings",
        permanent: false,
      },
      {
        source: "/patient/appointments/:path*",
        destination: "/patient/bookings",
        permanent: false,
      },
      {
        source: "/hospitals",
        destination: "/practices",
        permanent: false,
      },
      {
        source: "/hospitals/doctors",
        destination: "/practices",
        permanent: false,
      },
      {
        source: "/hospitals/doctors/info",
        destination: "/practices",
        permanent: false,
      },
      {
        source: "/hospitals/:id/info",
        destination: "/practices",
        permanent: false,
      },
      {
        source: "/admin/inbox",
        destination: "/admin/dashboard",
        permanent: false,
      },
      {
        source: "/admin/hospitals",
        destination: "/admin/dashboard",
        permanent: false,
      },
      {
        source: "/admin/users/:path*",
        destination: "/admin/dashboard",
        permanent: false,
      },
    ]
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "play-lh.googleusercontent.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "images.pexels.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
        pathname: "/**",
      },
      {
        protocol: "http",
        hostname: "127.0.0.1",
        port: "3001",
        pathname: "/api/v1/uploads/**",
      },
      {
        protocol: "http",
        hostname: "localhost",
        port: "3001",
        pathname: "/api/v1/uploads/**",
      },
    ],
  },
}

export default nextConfig
