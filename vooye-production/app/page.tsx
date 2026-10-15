import Link from "next/link";
import { db } from "@/lib/db";
import ProfileLink from "@/components/profile-link";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function formatPrice(pricePaise: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(pricePaise / 100);
}

export default async function Home() {
  let products: Array<{
    id: string;
    slug: string;
    name: string;
    category: string;
    imageUrl: string | null;
    pricePaise: number;
  }> = [];
  let productsUnavailable = false;

  try {
    products = await db.product.findMany({
      where: {
        status: "ACTIVE",
        stock: { gt: 0 },
        seller: { status: "APPROVED" },
      },
      select: {
        id: true,
        slug: true,
        name: true,
        category: true,
        imageUrl: true,
        pricePaise: true,
      },
      orderBy: { createdAt: "desc" },
      take: 60,
    });
  } catch (error) {
    // Keep the rest of the storefront available if the catalogue database is down.
    console.error(
      "Homepage product query failed:",
      error instanceof Error ? error.message : "Unknown error"
    );
    productsUnavailable = true;
  }

  return (
    <main className="wrap">
      <header className="top">
        <Link className="brand" href="/">VOOYE</Link>
        <nav className="nav">
          <Link href="/#shop">Shop</Link>
          <Link href="/seller">Sell on Vooye</Link>
          <Link href="/account/orders">My orders</Link>
          <Link href="/cart">Cart</Link>
          <ProfileLink />
        </nav>
      </header>

      <section className="hero">
        <div>
          <div className="eyebrow">Mirrors that make a room</div>
          <h1>
            A little more light.
            <br />
            A lot more you.
          </h1>
          <p>
            Thoughtful mirrors and home décor, selected from independent
            sellers to make your space feel like home.
          </p>
          <a className="button" href="#shop">Explore the collection</a>
        </div>
        <div className="hero-art" aria-label="Decorative mirror illustration">
          <div className="mirror" />
        </div>
      </section>

      <section id="shop" className="section">
        <div className="section-head">
          <div>
            <div className="eyebrow">The collection</div>
            <h2>Made to be looked at.</h2>
          </div>
          <span className="muted">Mirrors · Home décor</span>
        </div>

        {productsUnavailable ? (
          <div className="notice" role="status">
            The collection is temporarily unavailable. Please try again shortly.
          </div>
        ) : products.length === 0 ? (
          <div className="notice">
            New products are coming soon. Please check back for the latest collection.
          </div>
        ) : (
          <div className="grid">
            {products.map((product) => (
              <article className="product" key={product.id}>
                <div className="product-image">
                  {product.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={product.imageUrl}
                      alt={product.name}
                      loading="lazy"
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                      }}
                    />
                  ) : (
                    <div className="mini-mirror" aria-hidden="true" />
                  )}
                </div>
                <h3>{product.name}</h3>
                <div className="muted">{product.category}</div>
                <div className="price">{formatPrice(product.pricePaise)}</div>
                <Link
                  className="button"
                  href={`/product/${encodeURIComponent(product.slug)}`}
                >
                  View details
                </Link>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="section">
        <div className="grid">
          <div>
            <div className="eyebrow">For makers and stores</div>
            <h2>Have something beautiful to sell?</h2>
            <p className="muted">
              Create a seller profile, submit your shop for review and manage
              your catalogue in one place.
            </p>
            <Link className="button" href="/seller">Become a seller</Link>
          </div>
          <div>
            <div className="eyebrow">Your account</div>
            <h2>One place for your orders.</h2>
            <p className="muted">
              Sign in through Firebase to access your own order history and
              account.
            </p>
            <Link className="button" href="/account">View your account</Link>
          </div>
        </div>
      </section>

      <footer className="footer">
        © {new Date().getFullYear()} Vooye · Mirrors & home décor ·{" "}
        <Link href="/seller">Seller portal</Link>
      </footer>
    </main>
  );
}
