import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Vooye — Mirrors & Home Décor",
  description: "Thoughtful mirrors and home décor from independent sellers.",
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en-IN"><body>{children}</body></html>;
}
