import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vooye Seller Portal",
  description: "Manage your Vooye seller catalogue.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
