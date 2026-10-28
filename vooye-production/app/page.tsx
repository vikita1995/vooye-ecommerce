import Link from "next/link";
import { getPublishedProducts } from "@/lib/catalog";
import StorefrontNavigation from "@/components/storefront-navigation";
import ProductCardActions from "@/components/product-card-actions";

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
    products = await getPublishedProducts();
  } catch (error) {
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
        <StorefrontNavigation />
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
        <div className="hero-art hero-art-photo" role="img" aria-label="Gold arched full-length mirror styled for a warm, modern home">
          <img
            className="hero-lifestyle-image"
            src="https://cpoitylvklkcrclsaxem.supabase.co/storage/v1/object/public/vooye-products/products/arched-gold-floor-mirror/01-front-angle.jpeg"
            alt=""
            fetchPriority="high"
          />
          <div className="hero-photo-wash" aria-hidden="true" />
          <div className="hero-photo-note">
            <span className="hero-photo-kicker">THE REFLECTION EDIT</span>
            <span className="hero-photo-title">A little more you.</span>
            <span className="hero-photo-index">VOOYE · HOME, REFRAMED</span>
          </div>
        </div>
      </section>

      <section className="value-strip" aria-label="Vooye values">
        <div><span className="value-icon">✳</span><span><strong>Design-led finds</strong><small>Thoughtful details for every room</small></span></div>
        <div><span className="value-icon">⌂</span><span><strong>Thoughtfully curated</strong><small>Mirrors selected for your home</small></span></div>
        <div><span className="value-icon">◌</span><span><strong>Made to feel like home</strong><small>Personal style, beautifully reflected</small></span></div>
      </section>

      <section id="shop" className="section collection-section">
        <div className="section-head">
          <div>
            <div className="eyebrow">The collection</div>
            <h2>Find your kind of beautiful.</h2>
            <p className="section-intro">A collection of mirrors and accents that bring your rooms into focus.</p>
          </div>
          <a className="text-link" href="#shop">Explore the VOOYE edit <span aria-hidden="true">↗</span></a>
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
                  {(product.imageUrl || product.slug.startsWith("vooye-gold-arched-floor-mirror")) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={product.imageUrl || "https://cpoitylvklkcrclsaxem.supabase.co/storage/v1/object/public/vooye-products/products/arched-gold-floor-mirror/01-front-angle.jpeg"}
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
                </div>
                <ProductCardActions item={{
                  productId: product.id,
                  slug: product.slug,
                  name: product.name,
                  pricePaise: product.pricePaise,
                  imageUrl: product.imageUrl,
                }} />
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
            <div className="eyebrow">The Vooye collection</div>
            <h2>Find a piece that feels like yours.</h2>
            <p className="muted">
              Explore full-length mirrors and considered accents selected for
              a calm, thoughtfully finished home.
            </p>
            <Link className="button" href="/#shop">Shop the collection</Link>
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
        <div className="footer-links"><Link href="/#shop">Shop the collection</Link><Link href="/account">Your account</Link><Link href="/cart">Cart</Link></div>
        <div className="footer-bottom"><span>© {new Date().getFullYear()} VOOYE. Thoughtfully considered.</span><span>Mirrors · Home décor · Everyday beauty</span></div>
      </footer>
    </main>
  );
}
