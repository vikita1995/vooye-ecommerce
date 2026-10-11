import Link from "next/link";
export default async function ProductPage({params}:{params:Promise<{slug:string}>}) {
 const {slug}=await params;
 const title=slug.split("-").map(s=>s.charAt(0).toUpperCase()+s.slice(1)).join(" ");
 return <main className="wrap"><header className="top"><Link className="brand" href="/">VOOYE</Link><nav className="nav"><Link href="/">Shop</Link><Link href="/cart">Cart</Link></nav></header><section className="hero"><div className="hero-art"><div className="mirror"/></div><div><div className="eyebrow">Mirror collection</div><h1>{title}</h1><p>Carefully selected for a considered home. Product dimensions, shipping estimates and seller details will be supplied by the approved seller listing.</p><div className="notice">Preview product page. Add-to-cart and checkout remain disabled until the database and Razorpay flow pass end-to-end tests.</div><Link className="button" href="/cart">Go to cart</Link></div></section></main>;
}
