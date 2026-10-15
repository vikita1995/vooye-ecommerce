"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

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
    const supabase = createClient();
    let active = true;

    void supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active) return;
      if (sessionError) setError(sessionError.message);
      setUser(data.session?.user ?? null);
      if (data.session?.access_token) void loadProfile(data.session.access_token);
      else setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setUser(session?.user ?? null);
      if (session?.access_token) {
        void loadProfile(session.access_token);
      } else {
        setCustomer(null);
        setLoading(false);
      }
    });

    return () => { active = false; subscription.unsubscribe(); };
  }, [loadProfile]);

  async function getAccessToken() {
    const { data, error } = await createClient().auth.getSession();
    if (error || !data.session?.access_token) throw new Error("Please sign in again.");
    return data.session.access_token;
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

  async function sendPhoneOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(""); setMessage("");
    try {
      if (!/^\+[1-9]\d{7,14}$/.test(phone.trim())) throw new Error("Enter a phone number with country code, e.g. +919876543210.");
      const { error } = await createClient().auth.updateUser({ phone: phone.trim() });
      if (error) throw error;
      setPhoneOtpSent(true);
      setMessage("Verification code sent to your mobile number.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to send verification code.");
    } finally { setBusy(false); }
  }

  async function verifyPhoneOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(""); setMessage("");
    try {
      if (!/^\d{6}$/.test(otp.trim())) throw new Error("Enter the 6-digit verification code.");
      const { data, error } = await createClient().auth.verifyOtp({
        phone: phone.trim(), token: otp.trim(), type: "phone_change",
      });
      if (error) throw error;
      const token = data.session?.access_token ?? await getAccessToken();
      const response = await fetch("/api/customer/phone", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ phone_number: data.user?.phone ?? phone.trim() }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || "Verified number could not be saved to the profile.");
      setPhone(""); setOtp(""); setPhoneOtpSent(false);
      setMessage("Your mobile number has been verified.");
      await loadProfile(token);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to verify the mobile number.");
    } finally { setBusy(false); }
  }

  async function signOut() {
    setBusy(true); setError("");
    const { error } = await createClient().auth.signOut();
    if (error) { setError(error.message); setBusy(false); return; }
    window.location.assign("/");
  }

  if (loading && !user) return <main className="wrap section"><p>Checking your sign-in…</p></main>;

  return (
    <main className="wrap">
      <header className="top">
        <Link className="brand" href="/">VOOYE</Link>
        <nav className="nav"><Link href="/">Shop</Link><Link href="/account/orders">My orders</Link><Link href="/account/addresses">My addresses</Link><Link href="/seller">Seller portal</Link></nav>
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
                    <label className="field">Full name<input name="full_name" autoComplete="name" minLength={2} maxLength={100} required value={fullName} onChange={(e) => setFullName(e.target.value)} /></label>
                    <label className="field">Date of birth<input name="date_of_birth" type="date" min="1900-01-01" max={new Date().toISOString().slice(0, 10)} value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} /></label>
                    <label className="field">Gender<select name="gender" value={gender} onChange={(e) => setGender(e.target.value)}><option value="">Prefer not to say</option><option value="male">Male</option><option value="female">Female</option><option value="other">Other</option></select></label>
                    <button type="submit" disabled={saving}>{saving ? "Saving…" : "Save changes"}</button>
                  </form>
                </article>
                <article className="panel">
                  <h2>Email and mobile number</h2>
                  <p><strong>Email:</strong> {user.email || "Not linked"} {user.email_confirmed_at ? "(verified)" : ""}</p>
                  <p><strong>Mobile:</strong> {user.phone || customer.phone_e164 || "Not linked"} {user.phone_confirmed_at ? "(verified)" : ""}</p>
                  <h3>{user.phone ? "Update mobile number" : "Add mobile number"}</h3>
                  <form className="stack" onSubmit={phoneOtpSent ? verifyPhoneOtp : sendPhoneOtp}>
                    <label className="field">Mobile number with country code<input type="tel" autoComplete="tel" placeholder="+919876543210" value={phone} onChange={(e) => setPhone(e.target.value)} disabled={phoneOtpSent || busy} required /></label>
                    {phoneOtpSent && <label className="field">6-digit verification code<input inputMode="numeric" autoComplete="one-time-code" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))} maxLength={6} required /></label>}
                    <button type="submit" disabled={busy || (phoneOtpSent && otp.length !== 6)}>{busy ? "Please wait…" : phoneOtpSent ? "Verify and save number" : "Send verification code"}</button>
                    {phoneOtpSent && <button type="button" disabled={busy} onClick={() => { setPhoneOtpSent(false); setOtp(""); setMessage(""); }}>Use a different number</button>}
                  </form>
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
