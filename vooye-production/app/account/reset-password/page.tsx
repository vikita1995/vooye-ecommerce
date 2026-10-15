"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function savePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(""); setMessage("");
    if (password.length < 8) { setError("Use at least 8 characters for your password."); return; }
    if (password !== confirmPassword) { setError("The passwords do not match."); return; }
    setBusy(true);
    try {
      const { data, error } = await createClient().auth.updateUser({ password });
      if (error) throw error;
      if (!data.user) throw new Error("Your recovery session is missing. Request a new reset link.");
      setMessage("Your password has been updated.");
      setPassword(""); setConfirmPassword("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to update your password.");
    } finally { setBusy(false); }
  }

  return (
    <main className="wrap">
      <header className="top"><Link className="brand" href="/">VOOYE</Link></header>
      <section className="section" style={{ maxWidth: 480, margin: "40px auto" }}>
        <h1>Choose a new password</h1>
        <p className="muted">Set a new password for your Vooye account.</p>
        <form className="stack" onSubmit={savePassword}>
          <label className="field">New password<input type="password" autoComplete="new-password" minLength={8} maxLength={128} value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
          <label className="field">Confirm new password<input type="password" autoComplete="new-password" minLength={8} maxLength={128} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required /></label>
          <button type="submit" disabled={busy}>{busy ? "Saving…" : "Update password"}</button>
        </form>
        {message && <p className="notice" role="status">{message}</p>}
        {error && <p className="notice" role="alert">{error}</p>}
        <p style={{ marginTop: 20 }}><Link href="/account">Back to your account</Link></p>
      </section>
    </main>
  );
}
