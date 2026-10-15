import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vooye — Mirrors & Home Décor",
  description: "Thoughtful mirrors and home décor from independent sellers.",
  icons: {
    icon: "https://cpoitylvklkcrclsaxem.supabase.co/storage/v1/object/public/vooye-products/brand/vooye-logo.png",
    apple: "https://cpoitylvklkcrclsaxem.supabase.co/storage/v1/object/public/vooye-products/brand/vooye-logo.png",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en-IN"><body>{children}</body></html>;
}
