import Link from "next/link";
import CartContent from "@/components/cart-content";

export default function CartPage() {
  return <main className="wrap">
    <header className="top"><Link className="brand" href="/" aria-label="Vooye home">VOOYE</Link>
      <nav className="nav"><Link href="/#shop">Shop</Link><Link href="/account">My account</Link><Link href="/seller">Seller portal</Link></nav>
    </header>
    <CartContent />
  </main>;
}
