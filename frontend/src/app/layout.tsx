import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://vooye.in"
  ),
  title: {
    default: "Vooye | Mirrors, Furniture, and Decor",
    template: "%s | Vooye",
  },
  description:
    "Shop premium mirrors, furniture, and decor for modern Indian homes.",
  applicationName: "Vooye",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Vooye",
    description:
      "Premium mirrors, furniture, and decor for modern Indian homes.",
    url: "/",
    siteName: "Vooye",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}