"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  GoogleAuthProvider,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  signInWithPopup,
  type ConfirmationResult,
} from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase-client";

export default function SignInPage() {
  const [busy, setBusy] = useState(false);
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [confirmation, setConfirmation] =
    useState<ConfirmationResult | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const recaptchaRef = useRef<RecaptchaVerifier | null>(null);

  useEffect(() => {
    return () => {
      recaptchaRef.current?.clear();
      recaptchaRef.current = null;
    };
  }, []);

  async function signInWithGoogle() {
    setBusy(true);
    setError("");
    setMessage("");

    try {
      const auth = getFirebaseAuth();
      const provider = new GoogleAuthProvider();

      await signInWithPopup(auth, provider);
      window.location.assign("/account");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to sign in with Google."
      );
    } finally {
      setBusy(false);
    }
  }

  async function sendOtp() {
    setBusy(true);
    setError("");
    setMessage("");

    try {
      const auth = getFirebaseAuth();
      const normalizedPhone = phone.trim();

      // International format: +919876543210
      if (!/^\+[1-9]\d{7,14}$/.test(normalizedPhone)) {
        throw new Error(
          "Enter a valid phone number with country code, e.g. +919876543210."
        );
      }

      if (!recaptchaRef.current) {
        recaptchaRef.current = new RecaptchaVerifier(
          auth,
          "phone-recaptcha",
          { size: "normal" }
        );

        await recaptchaRef.current.render();
      }

      const result = await signInWithPhoneNumber(
        auth,
        normalizedPhone,
        recaptchaRef.current
      );

      setConfirmation(result);
      setMessage("Verification code sent. Check your phone.");
    } catch (err) {
      recaptchaRef.current?.clear();
      recaptchaRef.current = null;

      setError(
        err instanceof Error
          ? err.message
          : "Unable to send verification code."
      );
    } finally {
      setBusy(false);
    }
  }

  async function verifyOtp() {
    setBusy(true);
    setError("");
    setMessage("");

    try {
      if (!confirmation) {
        throw new Error("Request a verification code first.");
      }

      if (!/^\d{6}$/.test(otp.trim())) {
        throw new Error("Enter the 6-digit verification code.");
      }

      await confirmation.confirm(otp.trim());
      window.location.assign("/account");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to verify the code. Please try again."
      );
    } finally {
      setBusy(false);
    }
  }

  function useDifferentNumber() {
    recaptchaRef.current?.clear();
    recaptchaRef.current = null;

    setConfirmation(null);
    setOtp("");
    setError("");
    setMessage("");
  }

  return (
    <main className="wrap">
      <header className="top">
        <Link className="brand" href="/">
          VOOYE
        </Link>

        <nav className="nav">
          <Link href="/">Shop</Link>
          <Link href="/account">My account</Link>
        </nav>
      </header>

      <section
        className="section"
        style={{ maxWidth: 480, margin: "40px auto" }}
      >
        <div className="eyebrow">YOUR ACCOUNT</div>

        <h1>Welcome to Vooye</h1>

        <p className="muted">
          Sign in to manage your profile, addresses and orders.
        </p>

        {/* Google sign-in */}
        <button
          type="button"
          onClick={signInWithGoogle}
          disabled={busy}
          style={{
            width: "100%",
            padding: 14,
            marginTop: 20,
            cursor: busy ? "wait" : "pointer",
          }}
        >
          {busy ? "Please wait…" : "Continue with Google"}
        </button>

        {/* Divider */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            margin: "24px 0",
          }}
        >
          <div style={{ height: 1, background: "#ddd", flex: 1 }} />
          <span className="muted">OR</span>
          <div style={{ height: 1, background: "#ddd", flex: 1 }} />
        </div>

        {/* Phone sign-in */}
        <h2 style={{ fontSize: 20 }}>Continue with mobile</h2>

        <p className="muted">
          Enter your phone number with country code to receive a
          verification code by SMS.
        </p>

        <label htmlFor="phone">Mobile number</label>

        <input
          id="phone"
          type="tel"
          autoComplete="tel"
          placeholder="+919876543210"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          disabled={busy || confirmation !== null}
          style={{
            display: "block",
            width: "100%",
            padding: 12,
            marginTop: 8,
            boxSizing: "border-box",
          }}
        />

        {!confirmation ? (
          <button
            type="button"
            onClick={sendOtp}
            disabled={busy || !phone.trim()}
            style={{
              width: "100%",
              padding: 14,
              marginTop: 14,
              cursor: busy ? "wait" : "pointer",
            }}
          >
            {busy ? "Sending code…" : "Send verification code"}
          </button>
        ) : (
          <>
            <label
              htmlFor="otp"
              style={{ display: "block", marginTop: 18 }}
            >
              6-digit verification code
            </label>

            <input
              id="otp"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="Enter code"
              value={otp}
              onChange={(event) =>
                setOtp(
                  event.target.value.replace(/\D/g, "").slice(0, 6)
                )
              }
              disabled={busy}
              style={{
                display: "block",
                width: "100%",
                padding: 12,
                marginTop: 8,
                boxSizing: "border-box",
              }}
            />

            <button
              type="button"
              onClick={verifyOtp}
              disabled={busy || otp.length !== 6}
              style={{
                width: "100%",
                padding: 14,
                marginTop: 14,
                cursor: busy ? "wait" : "pointer",
              }}
            >
              {busy ? "Verifying…" : "Verify and sign in"}
            </button>

            <button
              type="button"
              onClick={useDifferentNumber}
              disabled={busy}
              style={{ marginTop: 12, padding: 8 }}
            >
              Use a different number
            </button>
          </>
        )}

        {/* Firebase reCAPTCHA renders here */}
        <div id="phone-recaptcha" style={{ marginTop: 16 }} />

        {message && (
          <p
            role="status"
            style={{ color: "green", marginTop: 16 }}
          >
            {message}
          </p>
        )}

        {error && (
          <p
            role="alert"
            style={{
              color: "crimson",
              marginTop: 16,
              overflowWrap: "anywhere",
            }}
          >
            {error}
          </p>
        )}

        <p className="muted" style={{ marginTop: 20, fontSize: 13 }}>
          By continuing with mobile, you agree to receive an SMS
          verification code. Your carrier may charge messaging fees.
        </p>
      </section>
    </main>
  );
}