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
        <Link className="brand" href="/" aria-label="Vooye home"><img src="https://cpoitylvklkcrclsaxem.supabase.co/storage/v1/object/public/vooye-products/brand/vooye-logo.png" alt="Vooye" style={{ display: "block", width: 138, height: 54, objectFit: "contain" }} /></Link>
        <nav className="nav">
          <Link href="/#shop">Shop</Link>
          <Link href="/seller">Sell on Vooye</Link>
          <Link href="/account/orders">My orders</Link>
          <Link href="/cart">Cart</Link>
          <ProfileLink />
        </nav>
      </header>

      <div className="announcement-bar">A more considered home starts with one beautiful detail <span aria-hidden="true">✦</span> Discover VOOYE</div>

      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow">The art of reflection · Est. for your space</div>
          <h1>
            Your space.
            <br />
            <span>Reflected beautifully.</span>
          </h1>
          <p>
            Discover statement mirrors and thoughtful home accents that bring
            light, character and a little everyday magic into your home.
          </p>
          <div className="hero-actions">
            <a className="button" href="#shop">Explore the collection <span aria-hidden="true">↗</span></a>
            <span className="hero-note">Pieces that make a space feel yours.</span>
          </div>
          <div className="hero-perks">
            <span><b>01</b> Thoughtfully selected</span>
            <span><b>02</b> Made for your home</span>
          </div>
        </div>
        <div className="hero-art" aria-label="Decorative mirror illustration">
          <div className="hero-sun" />
          <div className="hero-plant plant-left" aria-hidden="true">⌁</div>
          <div className="mirror"><span className="mirror-shine" /></div>
          <div className="hero-art-label"><span>THE REFLECTION EDIT</span><span>01 / VOOYE</span></div>
        </div>
      </section>

      <section className="value-strip" aria-label="Vooye values">
        <div><span className="value-icon">✳</span><span><strong>Design-led finds</strong><small>Thoughtful details for every room</small></span></div>
        <div><span className="value-icon">⌂</span><span><strong>Independent sellers</strong><small>Discover something different</small></span></div>
        <div><span className="value-icon">◌</span><span><strong>Made to feel like home</strong><small>Personal style, beautifully reflected</small></span></div>
      </section>

      <section id="shop" className="section collection-section">
        <div className="section-head">
          <div>
            <div className="eyebrow">The collection</div>
            <h2>Find your kind of beautiful.</h2>
            <p className="section-intro">A collection of mirrors and accents that bring your rooms into focus.</p>
          </div>
          <a className="text-link" href="#seller">Explore the VOOYE edit <span aria-hidden="true">↗</span></a>
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
                <div className="product-meta"><span>{product.category}</span><span className="product-dot" aria-hidden="true">✦</span></div>
                <h3>{product.name}</h3>
                <div className="product-bottom">
                  <div className="price">{formatPrice(product.pricePaise)}</div>
                  <Link
                    className="product-link"
                    href={`/product/${encodeURIComponent(product.slug)}`}
                    aria-label={`View ${product.name}`}
                  >
                    View piece <span aria-hidden="true">↗</span>
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section id="seller" className="section story-section">
        <div className="story-art" aria-hidden="true"><div className="story-arch"><div /></div><span>FORM · FUNCTION · FEELING</span></div>
        <div className="story-copy">
          <div className="eyebrow">A home that feels like you</div>
          <h2>It’s the little details that make a place yours.</h2>
          <p className="muted">From the first glance in the morning to the final touch before guests arrive, find pieces that make everyday living feel a little more special.</p>
          <a className="text-link" href="#shop">Find your reflection <span aria-hidden="true">↗</span></a>
        </div>
      </section>

      <section className="section audience-section">
        <div className="grid">
          <div className="audience-card seller-card">
            <div className="eyebrow">For makers and stores</div>
            <h2>Have something beautiful to sell?</h2>
            <p className="muted">
              Create a seller profile, submit your shop for review and manage
              your catalogue in one place.
            </p>
            <Link className="button" href="/seller">Become a seller</Link>
          </div>
          <div className="audience-card account-card">
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
        <div className="footer-brand"><Link className="brand" href="/" aria-label="Vooye home"><img src="https://cpoitylvklkcrclsaxem.supabase.co/storage/v1/object/public/vooye-products/brand/vooye-logo.png" alt="Vooye" style={{ display: "block", width: 120, height: 72, objectFit: "contain" }} /></Link><p>Reflections, refined.</p></div>
        <div className="footer-links"><Link href="/#shop">Shop the collection</Link><Link href="/seller">Seller portal</Link><Link href="/account">Your account</Link><Link href="/cart">Cart</Link></div>
        <div className="footer-bottom"><span>© {new Date().getFullYear()} VOOYE. Thoughtfully considered.</span><span>Mirrors · Home décor · Everyday beauty</span></div>
      </footer>
    </main>
  );
}
