import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const products = [
  { slug:"arc-full-length-mirror", name:"Arc Full-Length Mirror", category:"Full-length mirrors", description:"A sculptural full-length mirror with a warm oak-look frame, created to bring light and calm into your space.", dimensions:"160 × 55 cm", pricePaise:649900, compareAtPaise:799900, stock:18 },
  { slug:"halo-round-wall-mirror", name:"Halo Round Wall Mirror", category:"Wall mirrors", description:"A clean circular silhouette for entryways, bedrooms and living spaces.", dimensions:"60 cm diameter", pricePaise:289900, compareAtPaise:349900, stock:25 },
  { slug:"leaner-studio-mirror", name:"Leaner Studio Mirror", category:"Full-length mirrors", description:"A generous leaning mirror with a slim frame and timeless proportions.", dimensions:"170 × 65 cm", pricePaise:899900, stock:9 },
  { slug:"soft-edge-vanity-mirror", name:"Soft Edge Vanity Mirror", category:"Vanity mirrors", description:"A compact mirror for dressing tables and everyday routines.", dimensions:"45 × 35 cm", pricePaise:199900, compareAtPaise:249900, stock:30 },
  { slug:"arch-entryway-mirror", name:"Arch Entryway Mirror", category:"Wall mirrors", description:"An elegant arch shape that makes smaller rooms feel brighter.", dimensions:"90 × 50 cm", pricePaise:429900, stock:14 },
  { slug:"minimal-black-frame-mirror", name:"Minimal Black Frame Mirror", category:"Full-length mirrors", description:"A modern black frame with a crisp, understated finish.", dimensions:"150 × 50 cm", pricePaise:579900, stock:12 },
  { slug:"tabletop-round-mirror", name:"Tabletop Round Mirror", category:"Vanity mirrors", description:"A versatile tabletop mirror for desks, shelves and vanities.", dimensions:"25 cm diameter", pricePaise:129900, stock:42 },
  { slug:"premium-bedroom-mirror", name:"Premium Bedroom Mirror", category:"Full-length mirrors", description:"A statement mirror with a refined profile for bedrooms and dressing areas.", dimensions:"165 × 60 cm", pricePaise:749900, compareAtPaise:899900, stock:7 }
];
async function main() { for (const p of products) await prisma.product.upsert({ where:{slug:p.slug}, create:p, update:p }); }
main().finally(async()=>prisma.$disconnect());
