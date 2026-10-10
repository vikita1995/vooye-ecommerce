
"use client";

import { useEffect, useState } from "react";
import {
  GoogleAuthProvider,
  RecaptchaVerifier,
  onAuthStateChanged,
  signInWithPopup,
  signInWithPhoneNumber,
  signOut,
  type ConfirmationResult,
  type User,
} from "firebase/auth";
import Link from "next/link";
import { auth } from "@/lib/firebase";

export default function AccountPage() {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [confirmation, setConfirmation] =
    useState<ConfirmationResult | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    return onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setChecking(false);
    });
  }, []);

  async function googleSignIn() {
    setBusy(true);
    setMessage("");

    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Google sign-in failed."
      );
    } finally {
      setBusy(false);
    }
  }

  async function sendOtp() {
    setBusy(true);
    setMessage("");

    try {
      if (!/^\+[1-9]\d{7,14}$/.test(phone.trim())) {
        throw new Error(
          "Enter your number with country code, for example +919876543210."
        );
      }

      const verifier = new RecaptchaVerifier(auth, "recaptcha-container", {});
      const result = await signInWithPhoneNumber(
        auth,
        phone.trim(),
        verifier
      );

      setConfirmation(result);
      setMessage("OTP sent. Check your phone.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to send OTP."
      );
    } finally {
      setBusy(false);
    }
  }

  async function verifyOtp() {
    if (!confirmation) return;

    setBusy(true);
    setMessage("");

    try {
      await confirmation.confirm(otp.trim());
      setConfirmation(null);
      setOtp("");
      setMessage("You are signed in.");
    } catch {
      setMessage("OTP verification failed. Check the code and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await signOut(auth);
    setMessage("You have signed out.");
  }

  if (checking) {
    return <main className="wrap page"><p>Loading account...</p></main>;
  }

  if (user) {
    return (
      <main className="wrap page">
        <h1>Your account</h1>

        {user.photoURL && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.photoURL}
            alt=""
            width={72}
            height={72}
            style={{ borderRadius: "50%" }}
          />
        )}

        <p><strong>{user.displayName || "Vooye customer"}</strong></p>
        <p>{user.email || user.phoneNumber}</p>

        <div className="stack">
          <Link className="button" href="/account/orders">My orders</Link>
          <Link className="button" href="/wishlist">Wishlist</Link>
          <Link className="button" href="/track">Track order</Link>
          <button className="secondary" onClick={logout}>Sign out</button>
        </div>

        {message && <p role="status">{message}</p>}
      </main>
    );
  }

  return (
    <main className="wrap page">
      <div className="panel stack" style={{ maxWidth: 480, margin: "0 auto" }}>
        <h1>Welcome to VOOYE</h1>
        <p className="muted">
          Sign in to manage your account, wishlist and orders.
        </p>

        <button disabled={busy} onClick={googleSignIn}>
          Continue with Google
        </button>

        <div className="item">
          <label htmlFor="phone">Mobile number with country code</label>
          <input
            id="phone"
            type="tel"
            autoComplete="tel"
            placeholder="+919876543210"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
          />

          {!confirmation ? (
            <button disabled={busy} onClick={sendOtp}>
              Send OTP
            </button>
          ) : (
            <>
              <label htmlFor="otp">Verification code</label>
              <input
                id="otp"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="Enter OTP"
                value={otp}
                onChange={(event) => setOtp(event.target.value)}
              />
              <button disabled={busy || !otp.trim()} onClick={verifyOtp}>
                Verify OTP
              </button>
            </>
          )}
        </div>

        <div id="recaptcha-container" />

        {message && <p role="status">{message}</p>}

        <p className="muted small">
          By signing in, you agree to our store policies.
        </p>
      </div>
    </main>
  );
}
