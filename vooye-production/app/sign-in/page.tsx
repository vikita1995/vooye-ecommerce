
"use client";

import { useState } from "react";
import Link from "next/link";
import {
  GoogleAuthProvider,
  signInWithPopup,
} from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase-client";

export default function SignInPage() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function signInWithGoogle() {
    setBusy(true);
    setError("");

    try {
      const auth = getFirebaseAuth();
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);

      window.location.assign("/account");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to sign in."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="wrap">
      <header className="top">
        <Link className="brand" href="/">VOOYE</Link>
        <nav className="nav">
          <Link href="/">Shop</Link>
          <Link href="/account">My account</Link>
        </nav>
      </header>

      <section className="section" style={{ maxWidth: 480, margin: "40px auto" }}>
        <div className="eyebrow">YOUR ACCOUNT</div>
        <h1>Welcome to Vooye</h1>
        <p className="muted">
          Sign in to manage your profile, addresses and orders.
        </p>

        <button
          type="button"
          onClick={signInWithGoogle}
          disabled={busy}
          style={{ width: "100%", padding: 14, marginTop: 20 }}
        >
          {busy ? "Signing in…" : "Continue with Google"}
        </button>

        {error && (
          <p role="alert" style={{ color: "crimson", marginTop: 16 }}>
            {error}
          </p>
        )}

        <p className="muted" style={{ marginTop: 20 }}>
          After signing in, we will connect your identity to your Vooye
          customer profile.
        </p>
      </section>
    </main>
  );
}
