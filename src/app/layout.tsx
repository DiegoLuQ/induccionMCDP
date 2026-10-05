import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Inducción y Capacitación",
    template: "%s · Inducción y Capacitación",
  },
  description:
    "Plataforma SaaS multi-colegio para gestionar, estandarizar y auditar la inducción y capacitación de funcionarios.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0f172a",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es-CL" suppressHydrationWarning>
      <body className="min-h-screen bg-background font-sans" suppressHydrationWarning>
        {children}
        <Toaster richColors position="top-right" closeButton />
      </body>
    </html>
  );
}
