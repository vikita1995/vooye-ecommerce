
"use client";

import { useEffect, useRef, useState } from "react";
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

type ProfileResponse = {
  customer?: {
    registration_completed_at?: string | null;
  };
  registrationComplete?: boolean;
  error?: string;
};

export default function AccountPage() {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [confirmation, setConfirmation] =
    useState<ConfirmationResult | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [profileSynced, setProfileSynced] = useState(false);

  const recaptchaRef = useRef<RecaptchaVerifier | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setProfileSynced(false);

      if (!currentUser) {
        setChecking(false);
        return;
      }

      setChecking(true);
      setMessage("");

      try {
        const idToken = await currentUser.getIdToken();

        const response = await fetch("/api/customer/profile", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${idToken}`,
          },
          cache: "no-store",
        });

        const result = (await response
          .json()
          .catch(() => ({}))) as ProfileResponse;

        if (!response.ok) {
          throw new Error(
            result.error || "Unable to synchronize your customer profile."
          );
        }

        setProfileSynced(true);

        if (result.registrationComplete) {
          setMessage("You're signed in and your customer profile is ready.");
        } else {
          setMessage(
            "You're signed in. Complete your customer details before checkout."
          );
        }
      } catch (error) {
        setMessage(
          error instanceof Error
            ? `Signed in, but profile synchronization failed: ${error.message}`
            : "Signed in, but we couldn't synchronize your profile."
        );
      } finally {
        setChecking(false);
      }
    });

    return () => {
      unsubscribe();
      recaptchaRef.current?.clear();
      recaptchaRef.current = null;
    };
  }, []);

  async function googleSignIn() {
    setBusy(true);
    setMessage("");

    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
      // onAuthStateChanged synchronizes the customer profile.
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
      const normalizedPhone = phone.trim();

      if (!/^\+[1-9]\d{7,14}$/.test(normalizedPhone)) {
        throw new Error(
          "Enter your number with country code, for example +919876543210."
        );
      }

      if (!recaptchaRef.current) {
        recaptchaRef.current = new RecaptchaVerifier(
          auth,
          "recaptcha-container",
          {}
        );
      }

      const result = await signInWithPhoneNumber(
        auth,
        normalizedPhone,
        recaptchaRef.current
      );

      setConfirmation(result);
      setMessage("OTP sent. Check your phone.");
    } catch (error) {
      recaptchaRef.current?.clear();
      recaptchaRef.current = null;

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
      setMessage("OTP verified. Loading your customer profile...");
      // onAuthStateChanged synchronizes the customer profile.
    } catch {
      setMessage("OTP verification failed. Check the code and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    setBusy(true);

    try {
      await signOut(auth);
      setProfileSynced(false);
      setMessage("You have signed out.");
    } catch {
      setMessage("Unable to sign out. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (checking) {
    return (
      <main className="wrap page">
        <p>Loading account...</p>
      </main>
    );
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

        <p>
          <strong>{user.displayName || "Vooye customer"}</strong>
        </p>
        <p>{user.email || user.phoneNumber}</p>

        {message && <p role="status">{message}</p>}

        {profileSynced && (
          <div className="stack">
            <Link className="button" href="/account/orders">
              My orders
            </Link>
            <Link className="button" href="/wishlist">
              Wishlist
            </Link>
            <Link className="button" href="/track">
              Track order
            </Link>
          </div>
        )}

        <button
          className="secondary"
          disabled={busy}
          onClick={logout}
        >
          Sign out
        </button>
      </main>
    );
  }

  return (
    <main className="wrap page">
      <div
        className="panel stack"
        style={{ maxWidth: 480, margin: "0 auto" }}
      >
        <h1>Welcome to VOOYE</h1>

        <p className="muted">
          Sign in to manage your account, wishlist and orders.
        </p>

        <button disabled={busy} onClick={googleSignIn}>
          {busy ? "Please wait..." : "Continue with Google"}
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
            disabled={busy || Boolean(confirmation)}
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
                disabled={busy}
              />

              <button
                disabled={busy || !otp.trim()}
                onClick={verifyOtp}
              >
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
