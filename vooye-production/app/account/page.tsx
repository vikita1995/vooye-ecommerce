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
  date_of_birth: string | null;
  gender: "male" | "female" | "other" | null;
  registration_completed_at: string | null;
  status: string;
};

export default function AccountPage() {
  const [user, setUser] = useState<User | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [fullName, setFullName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [gender, setGender] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadProfile = useCallback(async (currentUser: User) => {
    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const token = await currentUser.getIdToken();

      const response = await fetch("/api/customer/profile", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });

      const result = (await response.json()) as {
        customer?: Customer;
        error?: string;
      };

      if (!response.ok || !result.customer) {
        throw new Error(result.error || "Unable to load your profile.");
      }

      const profile = result.customer;
      setCustomer(profile);
      setFullName(profile.full_name ?? "");
      setDateOfBirth(profile.date_of_birth ?? "");
      setGender(profile.gender ?? "");
    } catch (err) {
      setCustomer(null);
      setError(
        err instanceof Error ? err.message : "Unable to load your profile."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    try {
      unsubscribe = onAuthStateChanged(getFirebaseAuth(), (currentUser) => {
        setUser(currentUser);
        setCustomer(null);
        setError("");
        setSuccess("");

        if (currentUser) {
          void loadProfile(currentUser);
        } else {
          setLoading(false);
        }
      });
    } catch {
      setError("Unable to initialize sign-in. Please refresh the page.");
      setLoading(false);
    }

    return () => unsubscribe?.();
  }, [loadProfile]);

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!user || !customer) return;

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const token = await user.getIdToken();

      const response = await fetch("/api/customer/profile", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          full_name: fullName,
          date_of_birth: dateOfBirth || null,
          gender: gender || null,
        }),
      });

      const result = (await response.json()) as {
        customer?: Customer;
        error?: string;
      };

      if (!response.ok || !result.customer) {
        throw new Error(result.error || "Unable to save your profile.");
      }

      setCustomer(result.customer);
      setFullName(result.customer.full_name ?? "");
      setDateOfBirth(result.customer.date_of_birth ?? "");
      setGender(result.customer.gender ?? "");
      setSuccess("Your personal information has been saved.");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to save your profile."
      );
    } finally {
      setSaving(false);
    }
  }

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
          Manage your personal information, contact details, addresses and
          orders.
        </p>

        {loading ? (
          <p role="status">Loading your account…</p>
        ) : !user ? (
          <article className="panel">
            <h2>Welcome to Vooye</h2>
            <p className="muted">
              Sign in with Google or your mobile number to access your account.
            </p>
            <Link href="/sign-in">Sign in to your account →</Link>
          </article>
        ) : (
          <>
            {error && (
              <div className="notice" role="alert">
                {error}
                <button
                  type="button"
                  onClick={() => void loadProfile(user)}
                  style={{ marginLeft: 12 }}
                >
                  Try again
                </button>
              </div>
            )}

            {customer && (
              <>
                <article className="panel">
                  <h2>Personal information</h2>
                  <p className="muted">
                    Keep your details up to date for a smoother shopping
                    experience.
                  </p>

                  <form className="stack" onSubmit={handleSave}>
                    <label className="field">
                      Full name
                      <input
                        name="full_name"
                        autoComplete="name"
                        minLength={2}
                        maxLength={100}
                        required
                        value={fullName}
                        onChange={(event) => setFullName(event.target.value)}
                      />
                    </label>

                    <label className="field">
                      Date of birth
                      <input
                        name="date_of_birth"
                        type="date"
                        min="1900-01-01"
                        max={new Date().toLocaleDateString("en-CA")}
                        value={dateOfBirth}
                        onChange={(event) =>
                          setDateOfBirth(event.target.value)
                        }
                      />
                    </label>

                    <label className="field">
                      Gender
                      <select
                        name="gender"
                        value={gender}
                        onChange={(event) => setGender(event.target.value)}
                      >
                        <option value="">Prefer not to say</option>
                        <option value="male">Male</option>
                        <option value="female">Female</option>
                        <option value="other">Other</option>
                      </select>
                    </label>

                    <div>
                      <button type="submit" disabled={saving}>
                        {saving ? "Saving…" : "Save changes"}
                      </button>
                    </div>

                    {success && (
                      <p role="status" style={{ color: "green" }}>
                        {success}
                      </p>
                    )}
                  </form>
                </article>

                <article className="panel">
                  <h2>Email and mobile number</h2>

                  <div className="stack">
                    <div>
                      <strong>Email address</strong>
                      <p>{customer.email || "Not linked"}</p>
                      <span className="badge">
                        {customer.email_verified_at
                          ? "Verified"
                          : "Not verified"}
                      </span>
                    </div>

                    <div>
                      <strong>Mobile number</strong>
                      <p>{customer.phone_e164 || "Not linked"}</p>
                      <span className="badge">
                        {customer.phone_verified_at
                          ? "Verified"
                          : "Not verified"}
                      </span>
                    </div>
                  </div>

                  <p className="muted">
                    Contact details require a separate verification step before
                    they can be changed.
                  </p>
                </article>

                <div className="grid">
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
                  style={{ marginTop: 12 }}
                >
                  {signingOut ? "Signing out…" : "Sign out"}
                </button>
              </>
            )}
          </>
        )}
      </section>
    </main>
  );
}