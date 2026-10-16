"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function safeNextPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/account";
  return value;
}

function SignInForm() {
  const searchParams = useSearchParams();
  const nextPath = safeNextPath(searchParams.get("next"));
  const [mode, setMode] = useState<"sign-in" | "sign-up" | "phone" | "reset">("sign-in");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function run(action: () => Promise<void>) {
    setBusy(true); setError(""); setMessage("");
    try { await action(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to complete authentication."); }
    finally { setBusy(false); }
  }

  async function submitEmail(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run(async () => {
      const supabase = createClient();
      if (mode === "reset") {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/auth/callback?next=%2Faccount%2Freset-password`,
        });
        if (error) throw error;
        setMessage("Password reset instructions have been sent if the account exists.");
        return;
      }

      if (mode === "sign-up") {
        if (fullName.trim().length < 2) throw new Error("Enter your full name.");
        const { data, error } = await supabase.auth.signUp({
          email: email.trim().toLowerCase(),
          password,
          options: {
            data: { full_name: fullName.trim() },
            emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`,
          },
        });
        if (error) throw error;
        if (data.session) window.location.assign(nextPath);
        else setMessage("Check your email to confirm your account, then return here to sign in.");
        return;
      }

      const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
      if (error) throw error;
      if (!data.session) throw new Error("No session was created. Please try again.");
      window.location.assign(nextPath);
    });
  }

  async function googleSignIn() {
    await run(async () => {
      const { error } = await createClient().auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}` },
      });
      if (error) throw error;
    });
  }

  async function sendPhoneOtp(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run(async () => {
      const normalized = phone.trim();
      if (!/^\+[1-9]\d{7,14}$/.test(normalized)) throw new Error("Enter an international phone number, e.g. +919876543210.");
      const { error } = await createClient().auth.signInWithOtp({ phone: normalized, options: { shouldCreateUser: true } });
      if (error) {
        const raw = `${error.message} ${"code" in error ? String(error.code ?? "") : ""}`.toLowerCase();
        if (raw.includes("unsupported phone provider") || raw.includes("phone provider") || raw.includes("sms provider")) {
          throw new Error("Phone OTP is not enabled for this Supabase project. In Supabase Dashboard, open Authentication → Sign In / Providers → Phone, enable the Phone provider, and configure an SMS provider. Save the settings, then try again. If SMS is not configured, use email or Google sign-in for now.");
        }
        throw error;
      }
      setOtpSent(true);
      setMessage("Verification code sent. Enter the code from your SMS.");
    });
  }

  async function verifyPhoneOtp(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run(async () => {
      if (!/^\d{6}$/.test(otp.trim())) throw new Error("Enter the 6-digit code.");
      const { data, error } = await createClient().auth.verifyOtp({ phone: phone.trim(), token: otp.trim(), type: "sms" });
      if (error) throw error;
      if (!data.session) throw new Error("Verification succeeded but no session was returned.");
      window.location.assign(nextPath);
    });
  }

  return (
    <main className="wrap">
      <header className="top">
        <Link className="brand" href="/">VOOYE</Link>
        <nav className="nav"><Link href="/">Shop</Link><Link href="/seller">Become a seller</Link></nav>
      </header>
      <section className="section" style={{ maxWidth: 480, margin: "40px auto" }}>
        <div className="eyebrow">YOUR ACCOUNT</div>
        <h1>{mode === "sign-up" ? "Create your Vooye account" : mode === "reset" ? "Reset your password" : mode === "phone" ? "Continue with mobile" : "Welcome to Vooye"}</h1>
        <p className="muted">Sign in to manage your profile, delivery addresses and orders.</p>
        {mode !== "phone" && mode !== "reset" && (
          <button type="button" onClick={() => void googleSignIn()} disabled={busy} style={{ width: "100%", padding: 14, marginTop: 20 }}>
            {busy ? "Please wait…" : "Continue with Google"}
          </button>
        )}
        {mode !== "phone" && mode !== "reset" && <p className="muted" style={{ textAlign: "center" }}>or use email and password</p>}
        {mode !== "phone" ? (
          <form className="stack" onSubmit={submitEmail}>
            {mode === "sign-up" && <label className="field">Full name<input autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} minLength={2} maxLength={100} required /></label>}
            <label className="field">Email address<input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={254} /></label>
            {mode !== "reset" && <label className="field">Password<input type="password" autoComplete={mode === "sign-up" ? "new-password" : "current-password"} value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} maxLength={128} required /></label>}
            <button type="submit" disabled={busy}>{busy ? "Please wait…" : mode === "sign-up" ? "Create account" : mode === "reset" ? "Send reset link" : "Sign in"}</button>
          </form>
        ) : (
          <form className="stack" onSubmit={otpSent ? verifyPhoneOtp : sendPhoneOtp}>
            <label className="field">Mobile number with country code<input type="tel" autoComplete="tel" placeholder="+919876543210" value={phone} onChange={(e) => setPhone(e.target.value)} disabled={otpSent || busy} required /></label>
            {otpSent && <label className="field">6-digit verification code<input inputMode="numeric" autoComplete="one-time-code" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))} maxLength={6} required /></label>}
            <button type="submit" disabled={busy || (otpSent && otp.length !== 6)}>{busy ? "Please wait…" : otpSent ? "Verify and sign in" : "Send verification code"}</button>
            {otpSent && <button type="button" disabled={busy} onClick={() => { setOtpSent(false); setOtp(""); setMessage(""); }}>Use a different number</button>}
          </form>
        )}
        {message && <p role="status" className="notice">{message}</p>}
        {error && <p role="alert" className="notice">{error}</p>}
        <div style={{ marginTop: 22, display: "flex", flexWrap: "wrap", gap: 12 }}>
          {mode === "sign-in" && <><button type="button" onClick={() => setMode("sign-up")} disabled={busy}>Create account</button><button type="button" onClick={() => setMode("phone")} disabled={busy}>Use mobile OTP</button><button type="button" onClick={() => setMode("reset")} disabled={busy}>Forgot password?</button></>}
          {(mode === "sign-up" || mode === "phone" || mode === "reset") && <button type="button" onClick={() => { setMode("sign-in"); setOtpSent(false); setOtp(""); setError(""); setMessage(""); }} disabled={busy}>Back to sign in</button>}
        </div>
      </section>
    </main>
  );
}


export default function SignInPage() {
  return (
    <Suspense fallback={<main className="wrap section"><p>Loading sign in…</p></main>}>
      <SignInForm />
    </Suspense>
  );
}
