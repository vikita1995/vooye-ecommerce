import type { Metadata } from "next";
import "./globals.css";
import { SiteHeader, SiteFooter } from "@/components/SiteLayout";
export const metadata: Metadata = { title:"Vooye | Thoughtful mirrors for your space", description:"Shop thoughtfully chosen mirrors and home essentials from Vooye.", metadataBase:new URL(process.env.NEXT_PUBLIC_STORE_URL || "http://localhost:3000") };
export default function RootLayout({children}:{children:React.ReactNode}) { return <html lang="en-IN"><body><SiteHeader/><main>{children}</main><SiteFooter/></body></html>; }
