"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { onAuthStateChanged, PhoneAuthProvider, RecaptchaVerifier, signOut as firebaseSignOut, updatePhoneNumber, type User } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase-client";
import StorefrontNavigation from "@/components/storefront-navigation";

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
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [phoneOtpSent, setPhoneOtpSent] = useState(false);
  const [editingPhone, setEditingPhone] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [phoneVerificationId, setPhoneVerificationId] = useState("");
  const recaptchaVerifier = useRef<RecaptchaVerifier | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timeout = window.setTimeout(() => {
      setResendCooldown((remaining) => Math.max(0, remaining - 1));
    }, 1000);
    return () => window.clearTimeout(timeout);
  }, [resendCooldown]);

  const loadProfile = useCallback(async (accessToken: string) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/customer/profile", {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok || !data.customer) throw new Error(data.error || "Unable to load your profile.");
      setCustomer(data.customer);
      setFullName(data.customer.full_name ?? "");
      setDateOfBirth(data.customer.date_of_birth ?? "");
      setGender(data.customer.gender ?? "");
    } catch (cause) {
      setCustomer(null);
      setError(cause instanceof Error ? cause.message : "Unable to load your profile.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    const auth = getFirebaseAuth();
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!active) return;
      setUser(firebaseUser);
      if (!firebaseUser) {
        setCustomer(null);
        setLoading(false);
        return;
      }
      try {
        const idToken = await firebaseUser.getIdToken();
        if (active) await loadProfile(idToken);
      } catch {
        if (active) {
          setCustomer(null);
          setError("Your sign-in session could not be verified. Please sign in again.");
          setLoading(false);
        }
      }
    });
    return () => { active = false; unsubscribe(); };
  }, [loadProfile]);

  async function getAccessToken() {
    const currentUser = getFirebaseAuth().currentUser;
    if (!currentUser) throw new Error("Please sign in again.");
    return currentUser.getIdToken();
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true); setError(""); setMessage("");
    try {
      const token = await getAccessToken();
      const response = await fetch("/api/customer/profile", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ full_name: fullName, date_of_birth: dateOfBirth || null, gender: gender || null }),
      });
      const data = await response.json();
      if (!response.ok || !data.customer) throw new Error(data.error || "Unable to save your profile.");
      setCustomer(data.customer);
      setMessage("Your personal information has been saved.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save your profile.");
    } finally { setSaving(false); }
  }

  async function requestPhoneCode() {
    const normalizedPhone = phone.trim();
    if (!/^\+[1-9]\d{7,14}$/.test(normalizedPhone)) {
      throw new Error("Enter a phone number with country code, e.g. +919876543210.");
    }
    const auth = getFirebaseAuth();
    if (!auth.currentUser) throw new Error("Please sign in again before verifying your mobile number.");

    recaptchaVerifier.current?.clear();
    recaptchaVerifier.current = new RecaptchaVerifier(auth, "phone-recaptcha-container", {
      size: "normal",
    });
    const provider = new PhoneAuthProvider(auth);
    const verificationId = await provider.verifyPhoneNumber(normalizedPhone, recaptchaVerifier.current);
    setPhoneVerificationId(verificationId);
    setPhoneOtpSent(true);
    setResendCooldown(30);
    setMessage("Verification code sent to your mobile number.");
  }

  async function sendPhoneOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(""); setMessage("");
    try {
      await requestPhoneCode();
    } catch (cause) {
      recaptchaVerifier.current?.clear();
      recaptchaVerifier.current = null;
      setError(cause instanceof Error ? cause.message : "Unable to send verification code.");
    } finally {
      setBusy(false);
    }
  }

  async function resendPhoneOtp() {
    if (busy || resendCooldown > 0) return;
    setBusy(true); setError(""); setMessage("");
    try {
      await requestPhoneCode();
    } catch (cause) {
      recaptchaVerifier.current?.clear();
      recaptchaVerifier.current = null;
      setError(cause instanceof Error ? cause.message : "Unable to resend verification code.");
    } finally {
      setBusy(false);
    }
  }

  async function verifyPhoneOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(""); setMessage("");
    try {
      if (!/^\d{6}$/.test(otp.trim())) throw new Error("Enter the 6-digit verification code.");
      if (!phoneVerificationId) throw new Error("Request a new verification code first.");
      const currentUser = getFirebaseAuth().currentUser;
      if (!currentUser) throw new Error("Please sign in again before verifying your mobile number.");

      const credential = PhoneAuthProvider.credential(phoneVerificationId, otp.trim());
      await updatePhoneNumber(currentUser, credential);
      setUser(currentUser);
      const token = await currentUser.getIdToken(true);
      const response = await fetch("/api/customer/phone", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ phone_number: currentUser.phoneNumber }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || "Verified number could not be saved to your profile.");
      setPhone(""); setOtp(""); setPhoneOtpSent(false); setEditingPhone(false); setPhoneVerificationId(""); setResendCooldown(0);
      recaptchaVerifier.current?.clear();
      recaptchaVerifier.current = null;
      setUser(currentUser);

      // Reflect the successful API response immediately so the status does not
      // remain "Not linked" while the profile is reloaded.
      if (result.phone?.phone_e164 && result.phone?.phone_verified_at) {
        setCustomer((previous) => previous ? {
          ...previous,
          phone_e164: result.phone.phone_e164,
          phone_verified_at: result.phone.phone_verified_at,
        } : previous);
      }

      setMessage("Your mobile number has been verified and saved to your account.");
      await loadProfile(token);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to verify the mobile number.");
    } finally { setBusy(false); }
  }

  async function signOut() {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth/session", { method: "DELETE", cache: "no-store" });
      if (!response.ok) throw new Error("Unable to clear your secure session.");
      await firebaseSignOut(getFirebaseAuth());
      window.location.assign("/");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to sign out.");
      setBusy(false);
    }
  }

  if (loading && !user) return <main className="wrap section"><p>Checking your sign-in…</p></main>;

  return (
    <main className="wrap account-page">
      <header className="top">
        <Link className="brand" href="/">VOOYE</Link>
        <StorefrontNavigation />
      </header>
      <section className="section">
        <div className="eyebrow">YOUR ACCOUNT</div>
        <h1>My account</h1>
        <p className="muted">Manage your personal information, contact details, addresses and orders.</p>

        {!user ? (
          <article className="panel"><h2>Welcome to Vooye</h2><p className="muted">Sign in to access your account.</p><Link href="/sign-in">Sign in to your account →</Link></article>
        ) : (
          <>
            {error && <p role="alert" className="notice">{error}</p>}
            {message && <p role="status" className="notice">{message}</p>}
            {loading ? <p role="status">Loading your profile…</p> : customer ? (
              <>
                <article className="panel">
                  <h2>Personal information</h2>
                  <form className="stack" onSubmit={saveProfile}>
                    <label className="field">Full name<input name="full_name" autoComplete="name" maxLength={100} value={fullName} onChange={(e) => setFullName(e.target.value)} /></label>
                    <label className="field">Date of birth<input name="date_of_birth" type="date" min="1900-01-01" max={new Date().toISOString().slice(0, 10)} value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} /></label>
                    <label className="field">Gender<select name="gender" value={gender} onChange={(e) => setGender(e.target.value)}><option value="">Prefer not to say</option><option value="male">Male</option><option value="female">Female</option><option value="other">Other</option></select></label>
                    <button type="submit" disabled={saving}>{saving ? "Saving…" : "Save changes"}</button>
                  </form>
                </article>
                <article className="panel">
                  <h2>Email and mobile number</h2>
                  <p><strong>Email:</strong> {user.email || "Not linked"} {user.emailVerified ? "(verified)" : ""}</p>
                  <p><strong>Mobile:</strong> {customer.phone_e164 || "Not linked"} {customer.phone_verified_at ? "· Verified" : ""}</p>
                  {customer.phone_e164 && customer.phone_verified_at && !editingPhone ? (
                    <div className="phone-verified-state" role="status">
                      <p>✓ Your mobile number is verified and saved to your account.</p>
                      <button type="button" onClick={() => { setEditingPhone(true); setPhone(""); setOtp(""); setMessage(""); }}>Change mobile number</button>
                    </div>
                  ) : (
                    <>
                      <h3>{customer.phone_e164 ? "Update mobile number" : "Add mobile number"}</h3>
                      <div id="phone-recaptcha-container" />
                      <form className="stack" onSubmit={phoneOtpSent ? verifyPhoneOtp : sendPhoneOtp}>
                        <label className="field">Mobile number with country code<input type="tel" autoComplete="tel" placeholder="+919876543210" value={phone} onChange={(e) => setPhone(e.target.value)} disabled={phoneOtpSent || busy} required /></label>
                        {phoneOtpSent && <label className="field">6-digit verification code<input inputMode="numeric" autoComplete="one-time-code" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))} maxLength={6} required /></label>}
                        <button type="submit" disabled={busy || (phoneOtpSent && otp.length !== 6)}>{busy ? "Please wait…" : phoneOtpSent ? "Verify and save number" : "Send verification code"}</button>
                        {phoneOtpSent && <button type="button" disabled={busy || resendCooldown > 0} onClick={() => void resendPhoneOtp()}>{resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : "Resend verification code"}</button>}
                        {phoneOtpSent && <button type="button" disabled={busy} onClick={() => { setPhoneOtpSent(false); setOtp(""); setPhoneVerificationId(""); setResendCooldown(0); setMessage(""); recaptchaVerifier.current?.clear(); recaptchaVerifier.current = null; }}>Use a different number</button>}
                        {editingPhone && <button type="button" disabled={busy} onClick={() => { setEditingPhone(false); setPhone(""); setOtp(""); setPhoneOtpSent(false); setPhoneVerificationId(""); setMessage(""); recaptchaVerifier.current?.clear(); recaptchaVerifier.current = null; }}>Cancel</button>}
                      </form>
                    </>
                  )}
                </article>
                <div className="grid">
                  <article className="panel"><h2>My addresses</h2><p className="muted">Manage your shipping and billing addresses.</p><Link href="/account/addresses">Manage my addresses →</Link></article>
                  <article className="panel"><h2>My orders</h2><p className="muted">View your purchases and order status.</p><Link href="/account/orders">View my orders →</Link></article>
                </div>
                <button type="button" onClick={() => void signOut()} disabled={busy} style={{ marginTop: 12 }}>{busy ? "Please wait…" : "Sign out"}</button>
              </>
            ) : <article className="panel"><p>Profile could not be loaded.</p><button type="button" onClick={() => void getAccessToken().then(loadProfile).catch((cause) => setError(cause instanceof Error ? cause.message : "Unable to reload profile."))}>Try again</button></article>}
          </>
        )}
      </section>
    </main>
  );
}
