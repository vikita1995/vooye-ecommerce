
"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

type SellerApplication = {
  firebase_uid: string;
  store_name: string;
  store_slug: string;
  description: string | null;
  support_email: string | null;
  phone: string | null;
  status: string;
  created_at: string;
};

type ApiPayload = {
  seller?: SellerApplication | null;
  error?: string;
  message?: string;
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "12px 14px",
  border: "1px solid #d4d4d4",
  borderRadius: 10,
  background: "#fff",
  color: "#171717",
  font: "inherit",
};

function readableStatus(status: string) {
  switch (status.toLowerCase()) {
    case "pending":
      return "Pending review";
    case "approved":
      return "Approved";
    case "rejected":
      return "Not approved";
    default:
      return status.replace(/[_-]/g, " ");
  }
}

function statusMessage(status: string) {
  switch (status.toLowerCase()) {
    case "pending":
      return "Your application is saved and waiting for the Vooye team to review it.";
    case "approved":
      return "Your seller application is approved. Seller workspace access can be enabled for your account.";
    case "rejected":
      return "Your application was not approved. Please contact Vooye support for next steps.";
    default:
      return "This is the latest status saved for your seller application.";
  }
}

export default function SellerPortal() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [seller, setSeller] = useState<SellerApplication | null>(null);
  const [storeName, setStoreName] = useState("");
  const [supportEmail, setSupportEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    let active = true;
    const supabase = createClient();
    void supabase.auth.getSession().then((result: Awaited<ReturnType<ReturnType<typeof createClient>["auth"]["getSession"]>>) => {
      const { data, error: sessionError } = result;
      if (!active) return;
      if (sessionError) setError("Unable to verify your sign-in session.");
      setUser(data.session?.user ?? null);
      setAuthReady(true);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
      if (!active) return;
      setUser(session?.user ?? null);
      setAuthReady(true);
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);

  const requestApplication = useCallback(
    async (method: "GET" | "POST") => {
      if (!user) {
        throw new Error("Please sign in before continuing.");
      }

      const { data: { session }, error: sessionError } = await createClient().auth.getSession();
    if (sessionError || !session?.access_token) throw new Error("Please sign in again.");
    const token = session.access_token;
      const response = await fetch("/api/seller/application", {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(method === "POST" ? { "Content-Type": "application/json" } : {}),
        },
        cache: "no-store",
        ...(method === "POST"
          ? {
              body: JSON.stringify({
                store_name: storeName.trim(),
                support_email: supportEmail.trim() || null,
                phone: phone.trim() || null,
                description: description.trim() || null,
              }),
            }
          : {}),
      });

      const payload = (await response.json().catch(() => ({}))) as ApiPayload;

      if (!response.ok) {
        throw new Error(
          payload.error || payload.message || "The request failed. Please try again."
        );
      }

      return payload;
    },
    [user, storeName, supportEmail, phone, description]
  );

  const loadSavedApplication = useCallback(async () => {
    if (!user) return;

    setLoading(true);
    setError("");

    try {
      const payload = await requestApplication("GET");
      const saved = payload.seller ?? null;
      setSeller(saved);

      if (saved) {
        setStoreName(saved.store_name);
        setSupportEmail(saved.support_email ?? "");
        setPhone(saved.phone ?? "");
        setDescription(saved.description ?? "");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load your seller status.");
    } finally {
      setLoading(false);
    }
  }, [user, requestApplication]);

  useEffect(() => {
    if (authReady && user) void loadSavedApplication();

    if (authReady && !user) {
      setSeller(null);
      setLoading(false);
    }
  }, [authReady, user, loadSavedApplication]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");
    setSubmitting(true);

    try {
      const payload = await requestApplication("POST");
      setSeller(payload.seller ?? null);
      setSuccess("Your seller application was saved successfully.");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unable to submit your application.";

      setError(message);

      // A duplicate application is not overwritten.
      // Fetch its saved status so the user can still see it.
      if (message.toLowerCase().includes("already exists")) {
        try {
          const payload = await requestApplication("GET");
          setSeller(payload.seller ?? null);
        } catch {
          // Keep the original error visible.
        }
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="wrap">
      <header className="top">
        <Link className="brand" href="/">VOOYE</Link>
        <nav className="nav">
          <Link href="/">Customer shop</Link>
          <Link href="/account/orders">My orders</Link>
          <Link href="/admin">Admin</Link>
        </nav>
      </header>

      <section className="section">
        <div className="eyebrow">Vooye partner studio</div>
        <h1>Seller portal</h1>
        <p className="muted">
          Apply to sell with Vooye and track your application status.
        </p>

        {!authReady ? (
          <div className="panel" role="status">Checking your sign-in status…</div>
        ) : !user ? (
          <div className="panel">
            <h2>Sign in to apply</h2>
            <p className="muted">
              Sign in with your Firebase account before submitting a seller application.
            </p>
            <p><Link href="/sign-in?next=%2Fseller">Go to sign in</Link></p>
          </div>
        ) : (
          <div className="grid">
            <article className="panel">
              <h2>Seller application</h2>
              <p className="muted">
                Signed in as {user.email || user.phone || "your account"}.
              </p>

              {loading ? (
                <p className="muted" role="status">Loading saved application…</p>
              ) : null}

              {seller ? (
                <div className="notice" role="status" aria-live="polite">
                  <strong>Application status: {readableStatus(seller.status)}</strong>
                  <p>{statusMessage(seller.status)}</p>
                  <p className="muted">Store: {seller.store_name}</p>
                  <p className="muted">
                    Submitted: {new Date(seller.created_at).toLocaleDateString()}
                  </p>
                </div>
              ) : null}

              {success ? (
                <p className="notice" role="status" aria-live="polite">{success}</p>
              ) : null}

              {error ? <p className="notice" role="alert">{error}</p> : null}

              {!seller ? (
                <form className="stack" onSubmit={handleSubmit}>
                  <label className="field">
                    Store name *
                    <input
                      style={inputStyle}
                      value={storeName}
                      onChange={(event) => setStoreName(event.target.value)}
                      minLength={2}
                      maxLength={100}
                      required
                      autoComplete="organization"
                      placeholder="e.g. The Mirror Studio"
                    />
                  </label>

                  <label className="field">
                    Contact email
                    <input
                      style={inputStyle}
                      type="email"
                      value={supportEmail}
                      onChange={(event) => setSupportEmail(event.target.value)}
                      maxLength={254}
                      autoComplete="email"
                      placeholder={user.email || "you@store.in"}
                    />
                  </label>

                  <label className="field">
                    Contact phone
                    <input
                      style={inputStyle}
                      type="tel"
                      value={phone}
                      onChange={(event) => setPhone(event.target.value)}
                      maxLength={30}
                      autoComplete="tel"
                      placeholder="+91 98765 43210"
                    />
                  </label>

                  <label className="field">
                    What do you sell?
                    <textarea
                      style={inputStyle}
                      value={description}
                      onChange={(event) => setDescription(event.target.value)}
                      maxLength={2000}
                      rows={4}
                      placeholder="Mirrors, wall décor, home accessories…"
                    />
                  </label>

                  <button type="submit" disabled={submitting || loading}>
                    {submitting ? "Submitting application…" : "Submit seller application"}
                  </button>
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => void loadSavedApplication()}
                  disabled={loading}
                >
                  Refresh application status
                </button>
              )}
            </article>

            <article className="panel">
              <h2>What happens next?</h2>
              <ol className="stack">
                <li>Submit your store and contact details.</li>
                <li>The Vooye team reviews the application.</li>
                <li>After approval, seller catalogue tools can be enabled for your account.</li>
              </ol>
              <p className="muted">
                The server sets the application status; it cannot be changed in this form.
              </p>
            </article>
          </div>
        )}
      </section>
    </main>
  );
}
