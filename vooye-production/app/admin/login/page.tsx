"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { useSearchParams } from "next/navigation";
import { getFirebaseAuth } from "@/lib/firebase-client";

function safeNextPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/admin/products";
  return value.startsWith("/admin") ? value : "/admin/products";
}

export default function AdminLoginPage() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const nextPath = safeNextPath(searchParams.get("next"));

  useEffect(() => {
    if (searchParams.get("error") === "not_admin") {
      setNotice("This account does not have Vooye administrator access.");
    }
  }, [searchParams]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");

    try {
      const auth = getFirebaseAuth();
      const credential = await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
      const idToken = await credential.user.getIdToken(true);

      // Create the secure HTTP-only session. Authorization is checked separately
      // by the server-side UID allowlist and admin API handlers.
      const response = await fetch("/api/auth/session", {
        method: "POST",
        headers: { Authorization: `Bearer ${idToken}` },
        cache: "no-store",
      });

      if (!response.ok) {
        await signOut(auth);
        throw new Error("Unable to create a secure session. Please try again.");
      }

      // Do not allow the public customer registration or login to grant admin access.
      const check = await fetch("/api/admin/access", {
        headers: { Authorization: `Bearer ${idToken}` },
        cache: "no-store",
      });
      if (!check.ok) {
        await fetch("/api/auth/session", { method: "DELETE", cache: "no-store" });
        await signOut(auth);
        throw new Error("This account is not authorized to manage Vooye products.");
      }

      window.location.assign(nextPath);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to sign in.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="wrap">
      <header className="top">
        <Link className="brand" href="/">VOOYE</Link>
        <Link href="/">Back to store</Link>
      </header>
      <section className="section" style={{ maxWidth: 460, margin: "48px auto" }}>
        <div className="eyebrow">PRIVATE ADMINISTRATION</div>
        <h1>Vooye admin sign in</h1>
        <p className="muted">Sign in with the dedicated administrator account. Customer accounts cannot access this area.</p>
        <form className="stack" onSubmit={submit}>
          <label className="field">
            Admin email
            <input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required maxLength={254} />
          </label>
          <label className="field">
            Password
            <input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required maxLength={128} />
          </label>
          <button type="submit" disabled={busy}>{busy ? "Verifying admin…" : "Sign in as admin"}</button>
        </form>
        {notice && <p role="status" className="notice">{notice}</p>}
        {error && <p role="alert" className="notice">{error}</p>}
      </section>
    </main>
  );
}
