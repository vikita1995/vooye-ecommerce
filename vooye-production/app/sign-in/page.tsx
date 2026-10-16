"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  RecaptchaVerifier,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPhoneNumber,
  signInWithPopup,
  signOut,
  type ConfirmationResult,
} from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { normalizeE164Phone } from "@/lib/validation";

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
  const [resendCooldown, setResendCooldown] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const confirmation = useRef<ConfirmationResult | null>(null);
  const recaptcha = useRef<RecaptchaVerifier | null>(null);

  useEffect(() => () => { recaptcha.current?.clear(); }, []);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timeout = window.setTimeout(() => {
      setResendCooldown((remaining) => Math.max(0, remaining - 1));
    }, 1000);
    return () => window.clearTimeout(timeout);
  }, [resendCooldown]);

  async function establishSession(user: import("firebase/auth").User) {
    const idToken = await user.getIdToken(true);
    const response = await fetch("/api/auth/session", {
      method: "POST",
      headers: { Authorization: `Bearer ${idToken}` },
      cache: "no-store",
    });
    if (!response.ok) {
      let safeMessage = "Secure session creation failed. Please try again.";
      try {
        const body = await response.json() as { error?: unknown };
        if (typeof body.error === "string" && body.error.length <= 180) safeMessage = body.error;
      } catch {
        // Keep the generic message if the server did not return JSON.
      }
      await signOut(getFirebaseAuth());
      throw new Error(`${safeMessage} (HTTP ${response.status})`);
    }
    window.location.assign(nextPath);
  }

  async function run(action: () => Promise<void>) {
    setBusy(true); setError(""); setMessage("");
    try { await action(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to complete authentication."); }
    finally { setBusy(false); }
  }

  async function submitEmail(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run(async () => {
      const auth = getFirebaseAuth();
      if (mode === "reset") {
        await sendPasswordResetEmail(auth, email.trim().toLowerCase(), { url: window.location.origin + "/sign-in" });
        setMessage("If an account exists for this email, password reset instructions have been sent.");
        return;
      }
      if (mode === "sign-up") {
        if (fullName.trim().length < 2) throw new Error("Enter your full name.");
        const credential = await createUserWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
        await establishSession(credential.user);
        return;
      }
      const credential = await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
      await establishSession(credential.user);
    });
  }

  async function googleSignIn() {
    await run(async () => {
      const result = await signInWithPopup(getFirebaseAuth(), new GoogleAuthProvider());
      await establishSession(result.user);
    });
  }

  async function requestLoginOtp() {
    const normalized = normalizeE164Phone(phone);
    if (!normalized) throw new Error("Enter an international phone number, e.g. +919876543210.");
    const auth = getFirebaseAuth();
    recaptcha.current?.clear();
    recaptcha.current = new RecaptchaVerifier(auth, "vooye-phone-recaptcha", { size: "normal" });
    confirmation.current = await signInWithPhoneNumber(auth, normalized, recaptcha.current);
    setOtpSent(true);
    setResendCooldown(30);
    setMessage("Verification code sent. Enter the code from your SMS.");
  }

  async function sendPhoneOtp(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run(async () => {
      try {
        await requestLoginOtp();
      } catch (cause) {
        recaptcha.current?.clear();
        recaptcha.current = null;
        confirmation.current = null;
        throw cause;
      }
    });
  }

  async function resendPhoneOtp() {
    if (resendCooldown > 0 || busy) return;
    await run(async () => {
      try {
        await requestLoginOtp();
      } catch (cause) {
        recaptcha.current?.clear();
        recaptcha.current = null;
        confirmation.current = null;
        throw cause;
      }
    });
  }

  async function verifyPhoneOtp(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run(async () => {
      if (!/^\\d{6}$/.test(otp.trim())) throw new Error("Enter the 6-digit code.");
      if (!confirmation.current) throw new Error("Request a new verification code first.");
      const result = await confirmation.current.confirm(otp.trim());
      await establishSession(result.user);
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
        {mode !== "phone" && mode !== "reset" && <button type="button" onClick={() => void googleSignIn()} disabled={busy} style={{ width: "100%", padding: 14, marginTop: 20 }}>{busy ? "Please wait…" : "Continue with Google"}</button>}
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
            <div id="vooye-phone-recaptcha" />
            <button type="submit" disabled={busy || (otpSent && otp.length !== 6)}>{busy ? "Please wait…" : otpSent ? "Verify and sign in" : "Send verification code"}</button>
            {otpSent && <button type="button" disabled={busy || resendCooldown > 0} onClick={() => void resendPhoneOtp()}>{resendCooldown > 0 ? "Resend code in " + resendCooldown + "s" : "Resend verification code"}</button>}
            {otpSent && <button type="button" disabled={busy} onClick={() => { confirmation.current = null; setOtpSent(false); setOtp(""); setResendCooldown(0); setMessage(""); recaptcha.current?.clear(); recaptcha.current = null; }}>Use a different number</button>}
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
  return <Suspense fallback={<main className="wrap section"><p>Loading sign in…</p></main>}><SignInForm /></Suspense>;
}
