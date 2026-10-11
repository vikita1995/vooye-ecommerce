
"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  onAuthStateChanged,
  signOut,
  RecaptchaVerifier,
  PhoneAuthProvider,
  linkWithCredential,
  updatePhoneNumber,
  type User,
} from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase-client";

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

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [phoneInput, setPhoneInput] = useState("");
  const [otp, setOtp] = useState("");
  const [verificationId, setVerificationId] = useState("");
  const [phoneBusy, setPhoneBusy] = useState(false);
  const [phoneMessage, setPhoneMessage] = useState("");
  const [phoneError, setPhoneError] = useState("");

  const recaptchaRef = useRef<RecaptchaVerifier | null>(null);
  const recaptchaContainerRef = useRef<HTMLDivElement | null>(null);

  const loadProfile = useCallback(async (currentUser: User) => {
    setLoading(true);
    setError("");

    try {
      const token = await currentUser.getIdToken();

      const response = await fetch("/api/customer/profile", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });

      const result = (await response.json()) as {
        customer?: Customer;
        error?: string;
      };

      if (!response.ok || !result.customer) {
        throw new Error(result.error || "Unable to load your profile.");
      }

      const profile = result.customer;

      setCustomer(profile);
      setFullName(profile.full_name ?? "");
      setDateOfBirth(profile.date_of_birth ?? "");
      setGender(profile.gender ?? "");
    } catch (cause) {
      setCustomer(null);
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to load your profile."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    try {
      unsubscribe = onAuthStateChanged(getFirebaseAuth(), (currentUser) => {
        setUser(currentUser);
        setCustomer(null);
        setError("");
        setSuccess("");
        setPhoneError("");
        setPhoneMessage("");
        setVerificationId("");
        setOtp("");

        if (currentUser) {
          void loadProfile(currentUser);
        } else {
          setLoading(false);
        }
      });
    } catch {
      setError("Unable to initialize sign-in. Please refresh the page.");
      setLoading(false);
    }

    return () => {
      unsubscribe?.();
      recaptchaRef.current?.clear();
      recaptchaRef.current = null;
    };
  }, [loadProfile]);

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!user || !customer) return;

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const token = await user.getIdToken();

      const response = await fetch("/api/customer/profile", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          full_name: fullName,
          date_of_birth: dateOfBirth || null,
          gender: gender || null,
        }),
      });

      const result = (await response.json()) as {
        customer?: Customer;
        error?: string;
      };

      if (!response.ok || !result.customer) {
        throw new Error(result.error || "Unable to save your profile.");
      }

      setCustomer(result.customer);
      setFullName(result.customer.full_name ?? "");
      setDateOfBirth(result.customer.date_of_birth ?? "");
      setGender(result.customer.gender ?? "");
      setSuccess("Your personal information has been saved.");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to save your profile."
      );
    } finally {
      setSaving(false);
    }
  }

  function clearPhoneVerification() {
    recaptchaRef.current?.clear();
    recaptchaRef.current = null;

    setVerificationId("");
    setOtp("");
    setPhoneMessage("");
    setPhoneError("");
  }

  async function handleSendOtp() {
    if (!user) return;

    const phone = phoneInput.trim();

    if (!/^\+[1-9]\d{7,14}$/.test(phone)) {
      setPhoneError(
        "Enter a valid international number, for example +919876543210."
      );
      return;
    }

    setPhoneBusy(true);
    setPhoneError("");
    setPhoneMessage("");

    try {
      const auth = getFirebaseAuth();

      if (!recaptchaRef.current) {
        if (!recaptchaContainerRef.current) {
          throw new Error("Verification could not initialize. Refresh the page and try again.");
        }

        recaptchaRef.current = new RecaptchaVerifier(
          auth,
          recaptchaContainerRef.current,
          { size: "normal" }
        );
      }

      const provider = new PhoneAuthProvider(auth);
      const id = await provider.verifyPhoneNumber(
        phone,
        recaptchaRef.current
      );

      setVerificationId(id);
      setPhoneMessage("OTP sent. Enter the verification code below.");
    } catch (cause) {
      recaptchaRef.current?.clear();
      recaptchaRef.current = null;

      setPhoneError(
        cause instanceof Error
          ? cause.message
          : "Unable to send the OTP. Please try again."
      );
    } finally {
      setPhoneBusy(false);
    }
  }

  async function handleVerifyPhone(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!user || !verificationId) return;

    const code = otp.trim();

    if (!/^\d{6}$/.test(code)) {
      setPhoneError("Enter the 6-digit verification code.");
      return;
    }

    setPhoneBusy(true);
    setPhoneError("");
    setPhoneMessage("");

    try {
      const credential = PhoneAuthProvider.credential(
        verificationId,
        code
      );

      const hasPhoneProvider = user.providerData.some(
        (provider) => provider.providerId === "phone"
      );

      let updatedUser: User;

      if (hasPhoneProvider) {
        // Replace the existing phone number on the current Firebase account.
        await updatePhoneNumber(user, credential);
        updatedUser = user;
      } else {
        // Link the verified phone to the existing Google/email account.
        const linked = await linkWithCredential(user, credential);
        updatedUser = linked.user;
      }

      await updatedUser.reload();

      const verifiedPhone = updatedUser.phoneNumber;

      if (!verifiedPhone) {
        throw new Error(
          "Firebase did not return the verified phone number. Please refresh and try again."
        );
      }

      const token = await updatedUser.getIdToken(true);

      const response = await fetch("/api/customer/phone", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ phone_number: verifiedPhone }),
      });

      const result = (await response.json()) as {
        success?: boolean;
        error?: string;
      };

      if (!response.ok || !result.success) {
        throw new Error(
          result.error || "Unable to save the verified phone number."
        );
      }

      setPhoneInput("");
      setOtp("");
      setVerificationId("");
      setPhoneMessage("Your mobile number has been verified and linked.");

      await loadProfile(updatedUser);
    } catch (cause) {
      setPhoneError(
        cause instanceof Error
          ? cause.message
          : "Unable to verify your mobile number."
      );
    } finally {
      setPhoneBusy(false);
    }
  }

  async function handleSignOut() {
    setSigningOut(true);
    setError("");

    try {
      await signOut(getFirebaseAuth());
      window.location.assign("/");
    } catch {
      setError("Unable to sign out. Please try again.");
      setSigningOut(false);
    }
  }

  return (
    <main className="wrap">
      <header className="top">
        <Link className="brand" href="/">
          VOOYE
        </Link>

        <nav className="nav">
          <Link href="/">Shop</Link>
          <Link href="/account/orders">My orders</Link>
          <Link href="/seller">Seller portal</Link>
        </nav>
      </header>

      <section className="section">
        <div className="eyebrow">YOUR ACCOUNT</div>
        <h1>My account</h1>
        <p className="muted">
          Manage your personal information, contact details, addresses and
          orders.
        </p>

        {loading ? (
          <p role="status">Loading your account…</p>
        ) : !user ? (
          <article className="panel">
            <h2>Welcome to Vooye</h2>
            <p className="muted">
              Sign in with Google or your mobile number to access your account.
            </p>
            <Link href="/sign-in">Sign in to your account →</Link>
          </article>
        ) : (
          <>
            {error && (
              <div className="notice" role="alert">
                {error}
                <button
                  type="button"
                  onClick={() => void loadProfile(user)}
                  style={{ marginLeft: 12 }}
                >
                  Try again
                </button>
              </div>
            )}

            {customer && (
              <>
                <article className="panel">
                  <h2>Personal information</h2>
                  <p className="muted">
                    Keep your details up to date for a smoother shopping
                    experience.
                  </p>

                  <form className="stack" onSubmit={handleSave}>
                    <label className="field">
                      Full name
                      <input
                        name="full_name"
                        autoComplete="name"
                        minLength={2}
                        maxLength={100}
                        required
                        value={fullName}
                        onChange={(event) => setFullName(event.target.value)}
                      />
                    </label>

                    <label className="field">
                      Date of birth
                      <input
                        name="date_of_birth"
                        type="date"
                        min="1900-01-01"
                        max={new Date().toLocaleDateString("en-CA")}
                        value={dateOfBirth}
                        onChange={(event) =>
                          setDateOfBirth(event.target.value)
                        }
                      />
                    </label>

                    <label className="field">
                      Gender
                      <select
                        name="gender"
                        value={gender}
                        onChange={(event) => setGender(event.target.value)}
                      >
                        <option value="">Prefer not to say</option>
                        <option value="male">Male</option>
                        <option value="female">Female</option>
                        <option value="other">Other</option>
                      </select>
                    </label>

                    <div>
                      <button type="submit" disabled={saving}>
                        {saving ? "Saving…" : "Save changes"}
                      </button>
                    </div>

                    {success && (
                      <p role="status" style={{ color: "green" }}>
                        {success}
                      </p>
                    )}
                  </form>
                </article>

                <article className="panel">
                  <h2>Email and mobile number</h2>

                  <div className="stack">
                    <div>
                      <strong>Email address</strong>
                      <p>{customer.email || "Not linked"}</p>
                      <span className="badge">
                        {customer.email_verified_at
                          ? "Verified"
                          : "Not verified"}
                      </span>
                    </div>

                    <div>
                      <strong>Mobile number</strong>
                      <p>{customer.phone_e164 || "Not linked"}</p>
                      <span className="badge">
                        {customer.phone_verified_at
                          ? "Verified"
                          : "Not verified"}
                      </span>
                    </div>
                  </div>

                  <div style={{ marginTop: 24 }}>
                    <h3>
                      {customer.phone_e164
                        ? "Update mobile number"
                        : "Add mobile number"}
                    </h3>
                    <p className="muted">
                      Verify your number by SMS to link it to your existing
                      account.
                    </p>

                    <form
                      className="stack"
                      onSubmit={
                        verificationId
                          ? handleVerifyPhone
                          : (event) => {
                              event.preventDefault();
                              void handleSendOtp();
                            }
                      }
                    >
                      <label className="field">
                        Mobile number with country code
                        <input
                          type="tel"
                          name="phone_number"
                          autoComplete="tel"
                          placeholder="+919876543210"
                          value={phoneInput}
                          onChange={(event) =>
                            setPhoneInput(event.target.value)
                          }
                          disabled={phoneBusy || Boolean(verificationId)}
                          required
                        />
                      </label>

                      <div
                        ref={recaptchaContainerRef}
                        id="phone-recaptcha-container"
                      />

                      {!verificationId ? (
                        <div>
                          <button
                            type="submit"
                            disabled={phoneBusy || !phoneInput.trim()}
                          >
                            {phoneBusy ? "Sending OTP…" : "Send OTP"}
                          </button>
                        </div>
                      ) : (
                        <>
                          <label className="field">
                            6-digit verification code
                            <input
                              type="text"
                              inputMode="numeric"
                              autoComplete="one-time-code"
                              pattern="[0-9]{6}"
                              maxLength={6}
                              value={otp}
                              onChange={(event) =>
                                setOtp(
                                  event.target.value.replace(/\D/g, "").slice(0, 6)
                                )
                              }
                              required
                            />
                          </label>

                          <div
                            style={{
                              display: "flex",
                              gap: 12,
                              flexWrap: "wrap",
                            }}
                          >
                            <button
                              type="submit"
                              disabled={phoneBusy || otp.length !== 6}
                            >
                              {phoneBusy
                                ? "Verifying…"
                                : "Verify and save number"}
                            </button>

                            <button
                              type="button"
                              disabled={phoneBusy}
                              onClick={clearPhoneVerification}
                            >
                              Change number
                            </button>
                          </div>
                        </>
                      )}

                      {phoneMessage && (
                        <p role="status" style={{ color: "green" }}>
                          {phoneMessage}
                        </p>
                      )}

                      {phoneError && (
                        <p role="alert" className="notice">
                          {phoneError}
                        </p>
                      )}
                    </form>
                  </div>
                </article>

                <div className="grid">
                  <article className="panel">
                    <h2>My addresses</h2>
                    <p className="muted">
                      Manage your shipping and billing addresses.
                    </p>
                    <Link href="/account/addresses">
                      Manage my addresses →
                    </Link>
                  </article>

                  <article className="panel">
                    <h2>My orders</h2>
                    <p className="muted">
                      View your purchases and order status.
                    </p>
                    <Link href="/account/orders">View my orders →</Link>
                  </article>
                </div>

                <button
                  type="button"
                  onClick={handleSignOut}
                  disabled={signingOut}
                  style={{ marginTop: 12 }}
                >
                  {signingOut ? "Signing out…" : "Sign out"}
                </button>
              </>
            )}
          </>
        )}
      </section>
    </main>
  );
}
