import Link from "next/link";
const products = [
 {slug:"arched-full-length-mirror",name:"Arched Full-Length Mirror",category:"Full-length mirrors",price:"₹8,499",tag:"Bestseller"},
 {slug:"round-wall-mirror",name:"Round Wall Mirror",category:"Wall mirrors",price:"₹3,299",tag:"Hand-finished"},
 {slug:"minimalist-dressing-mirror",name:"Minimalist Dressing Mirror",category:"Bedroom",price:"₹5,799",tag:"New arrival"}
];
export default function Home() {
 return <main className="wrap">
  <header className="top"><Link className="brand" href="/">VOOYE</Link><nav className="nav"><Link href="/#shop">Shop</Link><Link href="/seller">Sell on Vooye</Link><Link href="/account/orders">My orders</Link><Link href="/cart">Cart</Link></nav></header>
  <section className="hero"><div><div className="eyebrow">Mirrors that make a room</div><h1>A little more light.<br/>A lot more you.</h1><p>Thoughtful mirrors and home décor, selected from independent sellers to make your space feel like home.</p><a className="button" href="#shop">Explore the collection</a></div><div className="hero-art" aria-label="Decorative mirror illustration"><div className="mirror"/></div></section>
  <section id="shop" className="section"><div className="section-head"><div><div className="eyebrow">The collection</div><h2>Made to be looked at.</h2></div><span className="muted">Mirrors · Home décor</span></div><div className="grid">{products.map(p=><article className="product" key={p.slug}><div className="product-image"><div className="mini-mirror"/></div><div className="pill">{p.tag}</div><h3>{p.name}</h3><div className="muted">{p.category}</div><div className="price">{p.price}</div><Link className="button" href={`/product/${p.slug}`}>View details</Link></article>)}</div><div className="notice">Catalogue preview: connect the database and approve seller listings before opening live sales. Checkout is Razorpay-only; cash on delivery is not supported.</div></section>
  <section className="section"><div className="grid"><div><div className="eyebrow">For makers and stores</div><h2>Have something beautiful to sell?</h2><p className="muted">Create a seller profile, submit your shop for review and manage your catalogue in one place.</p><Link className="button" href="/seller">Become a seller</Link></div><div><div className="eyebrow">Your account</div><h2>One place for your orders.</h2><p className="muted">Sign in through Firebase to access your own order history and account.</p><Link className="button" href="/account/orders">View orders</Link></div><div><div className="eyebrow">Operations</div><h2>Built for growth.</h2><p className="muted">Seller approval, catalog moderation, inventory, orders and payment-event records.</p><Link className="button" href="/admin">Admin portal</Link></div></div></section>
  <footer className="footer">© {new Date().getFullYear()} Vooye · Mirrors & home décor · <Link href="/seller">Seller portal</Link></footer>
 </main>;
}
