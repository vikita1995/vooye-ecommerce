
import Link from "next/link";

export default function AccountPage() {
  return (
    <main className="wrap">
      <header className="top">
        <Link className="brand" href="/">
          VOOYE
        </Link>
        <nav className="nav">
          <Link href="/">Shop</Link>
          <Link href="/account/orders">My orders</Link>
          <Link href="/seller">Seller portal</Link>
        </nav>
      </header>

      <section className="section">
        <div className="eyebrow">Your account</div>
        <h1>Welcome to Vooye</h1>
        <p className="muted">
          Manage your profile, addresses and orders in one place.
        </p>

        <div className="grid">
          <article className="panel">
            <h2>My profile</h2>
            <p className="muted">
              Your personal details and contact information.
            </p>
            <p className="muted">
              Profile management will be available after sign-in is connected.
            </p>
          </article>

          <article className="panel">
            <h2>My addresses</h2>
            <p className="muted">
              Manage your shipping and billing addresses.
            </p>
            <p className="muted">
              Sign-in is required to manage saved addresses.
            </p>
          </article>

          <article className="panel">
            <h2>My orders</h2>
            <p className="muted">
              View your purchases and order status.
            </p>
            <Link href="/account/orders">View my orders →</Link>
          </article>
        </div>
      </section>
    </main>
  );
}
