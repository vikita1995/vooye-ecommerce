"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { onAuthStateChanged, type User } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase-client";

type SellerStatus = "pending" | "approved" | "rejected" | "suspended";
type SellerApplication = {
  firebase_uid: string;
  store_name: string;
  store_slug: string;
  description: string | null;
  support_email: string | null;
  phone: string | null;
  status: SellerStatus;
  created_at: string;
};
type AuditEvent = {
  id: string;
  seller_firebase_uid: string;
  previous_status: SellerStatus;
  new_status: SellerStatus;
  reason: string | null;
  admin_firebase_uid: string;
  created_at: string;
};

export default function AdminPortal() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [applications, setApplications] = useState<SellerApplication[]>([]);
  const [filter, setFilter] = useState<"pending" | "all" | SellerStatus>("pending");
  const [reasonByUid, setReasonByUid] = useState<Record<string, string>>({});
  const [busyUid, setBusyUid] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const unsubscribe = onAuthStateChanged(getFirebaseAuth(), (firebaseUser) => {
      if (!active) return;
      setUser(firebaseUser);
      setAuthReady(true);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const authorizedFetch = useCallback(async (url: string, init: RequestInit = {}) => {
    if (!user) throw new Error("Sign in with an administrator account first.");
    const firebaseUser = getFirebaseAuth().currentUser;
    if (!firebaseUser) throw new Error("Please sign in again.");
    const token = await firebaseUser.getIdToken();
    const response = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
      cache: "no-store",
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `Request failed (${response.status}).`);
    return payload;
  }, [user]);

  const loadApplications = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError("");
    try {
      const payload = await authorizedFetch(`/api/admin/sellers?status=${encodeURIComponent(filter)}`);
      setApplications(payload.applications ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load seller applications.");
    } finally {
      setLoading(false);
    }
  }, [authorizedFetch, filter, user]);

  useEffect(() => {
    void loadApplications();
  }, [loadApplications]);



  const updateStatus = async (seller: SellerApplication, status: SellerStatus) => {
    const reason = (reasonByUid[seller.firebase_uid] ?? "").trim();
    if ((status === "rejected" || status === "suspended") && reason.length < 5) {
      setError("Enter a reason of at least 5 characters for rejection or suspension.");
      return;
    }
    const action = status === "approved" ? "approve" : status === "rejected" ? "reject" : status === "suspended" ? "suspend" : "change status";
    if (!window.confirm(`Are you sure you want to ${action} ${seller.store_name}?`)) return;

    setBusyUid(seller.firebase_uid);
    setError("");
    setMessage("");
    try {
      await authorizedFetch("/api/admin/sellers", {
        method: "PATCH",
        body: JSON.stringify({
          firebase_uid: seller.firebase_uid,
          status,
          reason: reason || undefined,
        }),
      });
      setMessage(`${seller.store_name}: status changed to ${status}.`);
      await loadApplications();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to update seller status.");
    } finally {
      setBusyUid(null);
    }
  };

  if (!authReady) return <main className="wrap"><p>Checking sign-in…</p></main>;
  if (!user) {
    return (
      <main className="wrap">
        <header className="top"><Link className="brand" href="/" aria-label="Vooye home"><img src="https://cpoitylvklkcrclsaxem.supabase.co/storage/v1/object/public/vooye-products/brand/vooye-logo.png" alt="Vooye" style={{ display: "block", width: 138, height: 54, objectFit: "contain" }} /></Link><Link href="/sign-in">Sign in</Link></header>
        <section className="section"><h1>Admin console</h1><p>Sign in with your administrator account to continue.</p><Link href="/sign-in">Go to sign in</Link></section>
      </main>
    );
  }

  return (
    <main className="wrap">
      <header className="top">
        <Link className="brand" href="/">VOOYE</Link>
        <nav className="nav"><Link href="/">Storefront</Link><Link href="/seller">Seller portal</Link></nav>
      </header>
      <section className="section">
        <div className="eyebrow">Operations</div>
        <h1>Seller administration</h1>
        <p className="muted">Review seller applications and manage seller access. The server authorizes every operation independently.</p>

        {message && <p role="status" className="notice">{message}</p>}
        {error && <p role="alert" className="notice">{error}</p>}

        <div className="toolbar">
          <label>
            Status filter{" "}
            <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="suspended">Suspended</option>
              <option value="all">All statuses</option>
            </select>
          </label>
          <button type="button" onClick={() => void loadApplications()} disabled={loading}>
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>

        {loading && <p>Loading seller applications…</p>}
        {!loading && applications.length === 0 && <p>No applications found for this filter.</p>}

        <div className="grid">
          {applications.map((seller) => (
            <article className="panel" key={seller.firebase_uid}>
              <div className="seller-heading">
                <h2>{seller.store_name}</h2>
                <span className={`badge status-${seller.status}`}>{seller.status}</span>
              </div>
              <p className="muted">Store URL slug: {seller.store_slug}</p>
              <p>{seller.description || "No description provided."}</p>
              <p>Email: {seller.support_email || "Not provided"}</p>
              <p>Phone: {seller.phone || "Not provided"}</p>
              <p className="muted">Applied: {new Date(seller.created_at).toLocaleString()}</p>
              <details>
                <summary>Review note (required for rejection or suspension)</summary>
                <textarea
                  rows={3}
                  maxLength={1000}
                  value={reasonByUid[seller.firebase_uid] ?? ""}
                  onChange={(e) => setReasonByUid((old) => ({ ...old, [seller.firebase_uid]: e.target.value }))}
                  placeholder="Record the reason for this decision…"
                />
              </details>
              <div className="actions">
                {seller.status === "pending" && <>
                  <button disabled={busyUid === seller.firebase_uid} onClick={() => void updateStatus(seller, "approved")}>Approve</button>
                  <button disabled={busyUid === seller.firebase_uid} onClick={() => void updateStatus(seller, "rejected")}>Reject</button>
                </>}
                {seller.status === "approved" && <button disabled={busyUid === seller.firebase_uid} onClick={() => void updateStatus(seller, "suspended")}>Suspend seller</button>}
                {seller.status === "suspended" && <button disabled={busyUid === seller.firebase_uid} onClick={() => void updateStatus(seller, "approved")}>Reinstate seller</button>}

              </div>

            </article>
          ))}
        </div>
      </section>
      <style jsx>{`
        .toolbar,.actions,.seller-heading{display:flex;align-items:center;gap:.75rem;flex-wrap:wrap}
        .toolbar{justify-content:space-between;margin:1.25rem 0}
        .seller-heading{justify-content:space-between}
        .seller-heading h2{margin:0}
        .actions{margin-top:1rem}
        .actions button,.toolbar button{padding:.6rem .9rem;cursor:pointer}
        button:disabled{opacity:.55;cursor:wait}
        select,textarea{display:block;width:100%;max-width:100%;margin-top:.5rem;padding:.65rem}
        details{margin-top:1rem}
        summary{cursor:pointer}
        .audit{margin-top:1.25rem;border-top:1px solid #ddd;padding-top:1rem;overflow-wrap:anywhere}
        .audit li{margin:.75rem 0}
        .audit small{color:#666}
        .status-pending{background:#fff3cd}
        .status-approved{background:#d1e7dd}
        .status-rejected,.status-suspended{background:#f8d7da}
      `}</style>
    </main>
  );
}
