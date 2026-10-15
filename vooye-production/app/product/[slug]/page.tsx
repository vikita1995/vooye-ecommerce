import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";

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

  return (
    <main className="wrap">
      <header className="top">
        <Link className="brand" href="/">VOOYE</Link>
        <nav className="nav">
          <Link href="/#shop">Shop</Link>
          <Link href="/cart">Cart</Link>
        </nav>
      </header>

      <section className="hero">
        <div className="hero-art">
          {product.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={product.imageUrl}
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

          <Link className="button" href="/cart">
            Go to cart
          </Link>
          <p className="muted">
            <Link href="/#shop">← Back to the collection</Link>
          </p>
        </div>
      </section>
    </main>
  );
}
