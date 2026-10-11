
"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase-client";

type Customer = {
  id: string;
  firebase_uid: string;
  full_name: string | null;
  email: string | null;
  phone_e164: string | null;
  email_verified_at: string | null;
  phone_verified_at: string | null;
  registration_completed_at: string | null;
  status: string;
};

export default function AccountPage() {
  const [user, setUser] = useState<User | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [error, setError] = useState("");
  const [signingOut, setSigningOut] = useState(false);

  const loadProfile = useCallback(async (currentUser: User) => {
    setProfileLoading(true);
    setError("");

    try {
      const token = await currentUser.getIdToken();

      const response = await fetch("/api/customer/profile", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        cache: "no-store",
      });

      const result = (await response.json()) as {
        customer?: Customer;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(
          result.error || "Unable to load your customer profile."
        );
      }

      if (!result.customer) {
        throw new Error("The customer profile was not returned.");
      }

      setCustomer(result.customer);
    } catch (err) {
      setCustomer(null);
      setError(
        err instanceof Error
          ? err.message
          : "Unable to load your customer profile."
      );
    } finally {
      setProfileLoading(false);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const auth = getFirebaseAuth();

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setCustomer(null);
      setError("");

      if (currentUser) {
        void loadProfile(currentUser);
      } else {
        setLoading(false);
        setProfileLoading(false);
      }
    });

    return unsubscribe;
  }, [loadProfile]);

  async function handleSignOut() {
    setSigningOut(true);
    setError("");

    try {
      await signOut(getFirebaseAuth());
      window.location.assign("/");
    } catch {
      setError("Unable to sign out. Please try again.");
      setSigningOut(false);
    }
  }

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
        <div className="eyebrow">YOUR ACCOUNT</div>
        <h1>My account</h1>

        <p className="muted">
          Manage your profile, addresses and orders in one place.
        </p>

        {loading || profileLoading ? (
          <p role="status" style={{ marginTop: 24 }}>
            Loading your account…
          </p>
        ) : !user ? (
          <article className="panel" style={{ marginTop: 24 }}>
            <h2>Welcome to Vooye</h2>
            <p className="muted">
              Sign in with Google or your mobile number to access your account.
            </p>
            <p style={{ marginTop: 16 }}>
              <Link href="/sign-in">Sign in to your account →</Link>
            </p>
          </article>
        ) : (
          <>
            {error && (
              <div
                role="alert"
                className="panel"
                style={{ marginTop: 24 }}
              >
                <p>{error}</p>
                <button
                  type="button"
                  onClick={() => void loadProfile(user)}
                  style={{ marginTop: 12, padding: 10 }}
                >
                  Try again
                </button>
              </div>
            )}

            {customer && (
              <article className="panel" style={{ marginTop: 24 }}>
                <h2>My profile</h2>

                <dl style={{ display: "grid", gap: 16 }}>
                  <div>
                    <dt className="muted">Full name</dt>
                    <dd style={{ margin: "4px 0 0" }}>
                      {customer.full_name || "Not added"}
                    </dd>
                  </div>

                  <div>
                    <dt className="muted">Email</dt>
                    <dd style={{ margin: "4px 0 0" }}>
                      {customer.email || "Not linked"}
                    </dd>
                  </div>

                  <div>
                    <dt className="muted">Mobile number</dt>
                    <dd style={{ margin: "4px 0 0" }}>
                      {customer.phone_e164 || "Not linked"}
                    </dd>
                  </div>

                  <div>
                    <dt className="muted">Account status</dt>
                    <dd style={{ margin: "4px 0 0" }}>
                      {customer.status}
                    </dd>
                  </div>
                </dl>
              </article>
            )}

            <div className="grid" style={{ marginTop: 24 }}>
              <article className="panel">
                <h2>My addresses</h2>
                <p className="muted">
                  Manage your shipping and billing addresses.
                </p>
                <Link href="/account/addresses">
                  Manage my addresses →
                </Link>
              </article>

              <article className="panel">
                <h2>My orders</h2>
                <p className="muted">
                  View your purchases and order status.
                </p>
                <Link href="/account/orders">View my orders →</Link>
              </article>
            </div>

            <button
              type="button"
              onClick={handleSignOut}
              disabled={signingOut}
              style={{ marginTop: 24, padding: 12 }}
            >
              {signingOut ? "Signing out…" : "Sign out"}
            </button>
          </>
        )}
      </section>
    </main>
  );
}
