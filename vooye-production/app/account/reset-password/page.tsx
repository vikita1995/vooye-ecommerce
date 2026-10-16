"use client";

import { Suspense, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { confirmPasswordReset, verifyPasswordResetCode } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase-client";

function ResetPasswordForm() {
  const params = useSearchParams();
  const mode = params.get("mode");
  const code = params.get("oobCode");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [checking, setChecking] = useState(true);
  const [codeValid, setCodeValid] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    if (mode !== "resetPassword" || !code) {
      setError("This password reset link is invalid or expired. Request a new reset email.");
      setChecking(false);
      setCodeValid(false);
      return () => { active = false; };
    }

    setChecking(true);
    setError("");
    void verifyPasswordResetCode(getFirebaseAuth(), code)
      .then((accountEmail) => {
        if (!active) return;
        setEmail(accountEmail);
        setCodeValid(true);
      })
      .catch(() => {
        if (!active) return;
        setCodeValid(false);
        setError("This password reset link is invalid or expired. Request a new reset email.");
      })
      .finally(() => {
        if (active) setChecking(false);
      });

    return () => { active = false; };
  }, [code, mode]);

  async function savePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    if (!code || !codeValid) {
      setError("Request a new password reset email and open the newest link.");
      return;
    }
    if (password.length < 8) {
      setError("Use at least 8 characters for your password.");
      return;
    }
    if (password !== confirmPassword) {
      setError("The passwords do not match.");
      return;
    }

    setBusy(true);
    try {
      await confirmPasswordReset(getFirebaseAuth(), code, password);
      setMessage("Your password has been updated. Sign in with your new password.");
      setPassword("");
      setConfirmPassword("");
      setCodeValid(false);
    } catch (cause) {
      const code = cause && typeof cause === "object" && "code" in cause ? String(cause.code) : "";
      if (code === "auth/weak-password") {
        setError("Choose a stronger password that meets the account password policy.");
      } else if (code === "auth/expired-action-code" || code === "auth/invalid-action-code") {
        setError("This password reset link has expired or was already used. Request a new one.");
      } else {
        setError("Unable to update your password. Request a new reset email and try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="wrap">
      <header className="top"><Link className="brand" href="/">VOOYE</Link></header>
      <section className="section" style={{ maxWidth: 480, margin: "40px auto" }}>
        <div className="eyebrow">YOUR ACCOUNT</div>
        <h1>Choose a new password</h1>
        <p className="muted">Set a new password for your Vooye account.</p>
        {checking ? <p role="status">Checking your reset link…</p> : (
          <>
            {email && <p className="muted">Resetting password for {email}</p>}
            {codeValid && <form className="stack" onSubmit={savePassword}>
              <label className="field">New password<input type="password" autoComplete="new-password" minLength={8} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
              <label className="field">Confirm new password<input type="password" autoComplete="new-password" minLength={8} maxLength={128} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required /></label>
              <button type="submit" disabled={busy}>{busy ? "Saving…" : "Update password"}</button>
            </form>}
          </>
        )}
        {message && <p className="notice" role="status">{message}</p>}
        {error && <p className="notice" role="alert">{error}</p>}
        <p style={{ marginTop: 20 }}><Link href="/sign-in">Back to sign in</Link></p>
      </section>
    </main>
  );
}

export default function ResetPasswordPage() {
  return <Suspense fallback={<main className="wrap section"><p>Loading password reset…</p></main>}><ResetPasswordForm /></Suspense>;
}
