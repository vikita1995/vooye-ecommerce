import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import AddToCartButton from "@/components/add-to-cart";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ProductPageProps = {
  params: Promise<{ slug: string }>;
};

function formatPrice(pricePaise: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(pricePaise / 100);
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { slug } = await params;

  const product = await db.product.findFirst({
    where: {
      slug,
      status: "ACTIVE",
      stock: { gt: 0 },
      seller: { status: "APPROVED" },
    },
    select: {
      id: true,
      slug: true,
      name: true,
      category: true,
      description: true,
      dimensions: true,
      imageUrl: true,
      pricePaise: true,
      stock: true,
      seller: {
        select: {
          storeName: true,
          status: true,
        },
      },
    },
  });

  // Do not expose draft, hidden, out-of-stock, rejected, or suspended listings.
  if (!product) notFound();

  const isVooyeMirror = slug.startsWith("vooye-gold-arched-floor-mirror");
  const mirrorGallery = [
    "01-front-angle.jpeg",
    "02-side-angle.jpeg",
    "03-front-view.jpeg",
    "04-angled-view.jpeg",
    "05-room-view.jpeg",
    "06-room-view.jpeg",
  ].map((file) => `https://cpoitylvklkcrclsaxem.supabase.co/storage/v1/object/public/vooye-products/products/arched-gold-floor-mirror/${file}`);
  const primaryImage = product.imageUrl || (isVooyeMirror ? mirrorGallery[0] : null);

  return (
    <main className="wrap">
      <header className="top">
        <Link className="brand" href="/" aria-label="Vooye home"><img src="https://cpoitylvklkcrclsaxem.supabase.co/storage/v1/object/public/vooye-products/brand/vooye-logo.png" alt="Vooye" style={{ display: "block", width: 138, height: 54, objectFit: "contain" }} /></Link>
        <nav className="nav">
          <Link href="/#shop">Shop</Link>
          <Link href="/cart">Cart</Link>
        </nav>
      </header>

      <section className="hero">
        <div className="hero-art">
          {primaryImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={primaryImage}
              alt={product.name}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "contain",
                borderRadius: "1rem",
              }}
              fetchPriority="high"
            />
          ) : (
            <div className="mirror" aria-hidden="true" />
          )}
        </div>

        <div>
          <div className="eyebrow">{product.category}</div>
          <h1>{product.name}</h1>
          <div className="price">{formatPrice(product.pricePaise)}</div>
          <p>{product.description}</p>

          {isVooyeMirror && (
            <div className="panel" style={{ marginTop: 20 }}>
              <h2>Mirror specifications</h2>
              <p><strong>Size:</strong> 5 ft × 1.5 ft (152.4 × 45.72 cm)</p>
              <p><strong>Mirror weight:</strong> 6 kg; stand weight may be additional.</p>
              <p><strong>Available options:</strong> Hanging mirror — ₹2,599; mirror with stand — ₹2,999.</p>
              <p className="muted">Choose the matching product option before checkout. Price and stock must match the selected listing.</p>
            </div>
          )}

          {product.dimensions && (
            <p className="muted">
              <strong>Dimensions:</strong> {product.dimensions}
            </p>
          )}

          <p className="muted">
            Sold by {product.seller.storeName}
          </p>

          <p className="muted">
            {product.stock === 1
              ? "1 item in stock"
              : `${product.stock} items in stock`}
          </p>

          <div className="notice">
            Product availability and price are shown from the approved listing.
            Checkout is available only when the payment flow is enabled.
          </div>

          <AddToCartButton item={{
            productId: product.id,
            slug: product.slug,
            name: product.name,
            pricePaise: product.pricePaise,
            imageUrl: primaryImage,
          }} />
          <p style={{ marginTop: 12 }}><Link href="/cart">View cart →</Link></p>
          <p className="muted">
            <Link href="/#shop">← Back to the collection</Link>
          </p>
        </div>
      </section>
      {isVooyeMirror && (
        <section className="section" aria-label="Product gallery">
          <div className="eyebrow">A closer look</div>
          <h2>Explore every angle</h2>
          <div className="grid" style={{ marginTop: 20 }}>
            {mirrorGallery.map((image, index) => (
              <figure className="product" key={image}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={image} alt={`Vooye gold arched mirror view ${index + 1}`} loading="lazy" style={{ width: "100%", height: 320, objectFit: "contain", background: "#eee6db" }} />
              </figure>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
