import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublishedProductBySlug } from "@/lib/catalog";
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
  let product;
  try {
    product = await getPublishedProductBySlug(slug);
  } catch (error) {
    console.error(
      "Product detail query failed:",
      error instanceof Error ? error.message : "Unknown error"
    );
    throw new Error("The product catalogue is temporarily unavailable.");
  }

  // Only published products from approved sellers with stock are addressable.
  if (!product) notFound();

  return (
    <main className="wrap">
      <header className="top">
        <Link className="brand" href="/" aria-label="Vooye home">
          <img
            src="https://cpoitylvklkcrclsaxem.supabase.co/storage/v1/object/public/vooye-products/brand/vooye-logo.png"
            alt="Vooye"
            style={{ display: "block", width: 138, height: 54, objectFit: "contain" }}
          />
        </Link>
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

          {product.dimensions ? (
            <p className="muted"><strong>Dimensions:</strong> {product.dimensions}</p>
          ) : null}

          <p className="muted">Sold by {product.sellerStoreName}</p>
          <p className="muted">
            {product.stock === 1 ? "1 item in stock" : `${product.stock} items in stock`}
          </p>
          <div className="notice">
            Product availability and price are shown from the approved listing.
            Checkout is available only when the payment flow is enabled.
          </div>
          <AddToCartButton
            item={{
              productId: product.id,
              slug: product.slug,
              name: product.name,
              pricePaise: product.pricePaise,
              imageUrl: product.imageUrl,
            }}
          />
          <p style={{ marginTop: 12 }}><Link href="/cart">View cart →</Link></p>
          <p className="muted"><Link href="/#shop">← Back to the collection</Link></p>
        </div>
      </section>

      {product.images.length > 1 ? (
        <section className="section" aria-label="Product gallery">
          <div className="eyebrow">A closer look</div>
          <h2>Explore every angle</h2>
          <div className="grid" style={{ marginTop: 20 }}>
            {product.images.map((image, index) => (
              <figure className="product" key={image}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={image}
                  alt={`${product.name} view ${index + 1}`}
                  loading="lazy"
                  style={{ width: "100%", height: 320, objectFit: "contain", background: "#eee6db" }}
                />
              </figure>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
