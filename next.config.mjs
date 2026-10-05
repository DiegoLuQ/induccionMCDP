/** @type {import('next').NextConfig} */
const nextConfig = {
  /**
   * `next build` y `next dev` comparten `.next` por defecto, así que compilar
   * mientras el servidor de desarrollo está levantado le borra los chunks y la
   * página queda sin estilos (404 en /_next/static/css). Con esta variable, las
   * compilaciones de verificación usan su propio directorio:
   *   NEXT_DIST_DIR=.next-verify npx next build
   */
  distDir: process.env.NEXT_DIST_DIR || ".next",
  reactStrictMode: true,
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
    ],
  },
};

export default nextConfig;
