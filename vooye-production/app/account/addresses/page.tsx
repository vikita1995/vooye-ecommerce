
"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase-client";

type Address = {
  id: string;
  address_type: string;
  recipient_name: string;
  phone_e164: string;
  address_line1: string;
  address_line2: string | null;
  landmark: string | null;
  locality: string;
  city: string;
  state: string;
  postal_code: string;
  country_code: string;
};

type AddressForm = Omit<Address, "id">;
type AddressErrors = Partial<Record<keyof AddressForm, string>>;

const blankForm: AddressForm = {
  address_type: "shipping",
  recipient_name: "",
  phone_e164: "",
  address_line1: "",
  address_line2: "",
  landmark: "",
  locality: "",
  city: "",
  state: "",
  postal_code: "",
  country_code: "IN",
};

export default function AddressesPage() {
  const [token, setToken] = useState("");
  const [authReady, setAuthReady] = useState(false);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [form, setForm] = useState<AddressForm>(blankForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [fieldErrors, setFieldErrors] = useState<AddressErrors>({});

  useEffect(() => {
    let active = true;
    const auth = getFirebaseAuth();
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!active) return;
      setAuthReady(true);
      if (!firebaseUser) {
        setToken("");
        setAddresses([]);
        setLoading(false);
        return;
      }

      try {
        // Use the same Firebase identity as the homepage and account page.
        const idToken = await firebaseUser.getIdToken();
        const profileResponse = await fetch("/api/customer/profile", {
          headers: { Authorization: `Bearer ${idToken}` },
          cache: "no-store",
        });
        const profileData = await profileResponse.json();
        if (!profileResponse.ok || !profileData.customer) {
          throw new Error(profileData.error || "Unable to initialize your customer profile.");
        }
        if (active) {
          setToken(idToken);
          setLoading(false);
        }
      } catch (cause) {
        if (active) {
          setToken("");
          setMessage(cause instanceof Error ? cause.message : "Unable to initialize your customer profile.");
          setLoading(false);
        }
      }
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const loadAddresses = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setMessage("");

    try {
      const response = await fetch("/api/customer/addresses", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data = await response.json();

      if (!response.ok) throw new Error(data.error || "Unable to load addresses.");
      setAddresses(data.addresses ?? []);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Unable to load addresses.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (token) void loadAddresses();
  }, [token, loadAddresses]);

  function updateField(field: keyof AddressForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => {
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  function validateForm(values: AddressForm): AddressErrors {
    const errors: AddressErrors = {};
    const required: (keyof AddressForm)[] = [
      "recipient_name", "phone_e164", "address_line1", "locality",
      "city", "state", "postal_code",
    ];
    for (const field of required) {
      if (!String(values[field] ?? "").trim()) {
        errors[field] = "This field is required.";
      }
    }
    if (values.recipient_name.trim().length < 2) {
      errors.recipient_name = "Enter the recipient's full name.";
    }
    if (values.address_line1.trim().length < 4) {
      errors.address_line1 = "Enter a complete street address.";
    }
    if (!/^\+[1-9]\d{7,14}$/.test(values.phone_e164.trim())) {
      errors.phone_e164 = "Enter a phone number with country code, e.g. +919876543210.";
    }
    if (values.country_code === "IN" && !/^\d{6}$/.test(values.postal_code.trim())) {
      errors.postal_code = "Enter a valid 6-digit Indian PIN code.";
    }
    if (values.address_type !== "shipping" && values.address_type !== "billing") {
      errors.address_type = "Choose Shipping or Billing.";
    }
    if (values.country_code !== "IN") {
      errors.country_code = "Delivery outside India is not enabled yet.";
    }
    return errors;
  }

  function startEdit(address: Address) {
    const { id, ...values } = address;
    setEditingId(id);
    setForm({ ...blankForm, ...values });
    setFieldErrors({});
    setMessage("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(blankForm);
    setFieldErrors({});
    setMessage("");
  }

  async function saveAddress(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;

    const validationErrors = validateForm(form);
    setFieldErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) {
      setMessage("Please correct the highlighted address fields.");
      return;
    }

    setSaving(true);
    setMessage("");

    try {
      const response = await fetch(
        editingId
          ? `/api/customer/addresses/${encodeURIComponent(editingId)}`
          : "/api/customer/addresses",
        {
          method: editingId ? "PATCH" : "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(form),
        }
      );

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to save address.");

      setMessage(editingId ? "Address updated successfully." : "Address saved successfully.");
      setEditingId(null);
      setForm(blankForm);
      setFieldErrors({});
      await loadAddresses();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Unable to save address.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteAddress(id: string) {
    if (!token || !window.confirm("Delete this address?")) return;

    setMessage("");
    try {
      const response = await fetch(`/api/customer/addresses/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to delete address.");

      setAddresses((current) => current.filter((item) => item.id !== id));
      if (editingId === id) cancelEdit();
      setMessage("Address deleted successfully.");
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Unable to delete address.");
    }
  }

  if (!authReady || loading && !token) {
    return <main className="wrap section"><p>Loading your account…</p></main>;
  }

  if (!token) {
    return (
      <main className="wrap">
        <header className="top">
          <Link className="brand" href="/">VOOYE</Link>
          <nav className="nav"><Link href="/">Shop</Link><Link href="/account">My account</Link></nav>
        </header>
        <section className="section">
          <h1>Your addresses</h1>
          <p>Please sign in to manage your delivery addresses.</p>
          <Link href="/sign-in">Sign in</Link>
        </section>
      </main>
    );
  }

  const fields: { key: keyof AddressForm; label: string; required?: boolean; placeholder?: string }[] = [
    { key: "recipient_name", label: "Recipient name", required: true },
    { key: "phone_e164", label: "Phone number with country code", required: true, placeholder: "+919876543210" },
    { key: "address_line1", label: "Address line 1", required: true },
    { key: "address_line2", label: "Address line 2 (optional)" },
    { key: "landmark", label: "Landmark (optional)" },
    { key: "locality", label: "Area / locality", required: true },
    { key: "city", label: "City", required: true },
    { key: "state", label: "State", required: true },
    { key: "postal_code", label: "PIN / postal code", required: true },
  ];

  return (
    <main className="wrap">
      <header className="top">
        <Link className="brand" href="/">VOOYE</Link>
        <nav className="nav">
          <Link href="/">Shop</Link>
          <Link href="/account">My account</Link>
          <Link href="/account/orders">My orders</Link>
        </nav>
      </header>

      <section className="section">
        <div className="eyebrow">Your account</div>
        <h1>Delivery addresses</h1>
        <p className="muted">Manage the addresses used for your Vooye orders.</p>

        {message && <p role="status" aria-live="polite">{message}</p>}

        <form onSubmit={saveAddress} className="empty" style={{ marginTop: 24 }}>
          <h2>{editingId ? "Edit address" : "Add a new address"}</h2>

          <label>
            Address type
            <select
              value={form.address_type}
              onChange={(event) => updateField("address_type", event.target.value)}
              required
            >
              <option value="shipping">Shipping</option>
              <option value="billing">Billing</option>
            </select>
            {fieldErrors.address_type && <span role="alert" style={{ display: "block", color: "#b42318", marginTop: 4 }}>{fieldErrors.address_type}</span>}
          </label>
          <label style={{ display: "block", marginTop: 14 }}>
            Country
            <select
              value={form.country_code}
              onChange={(event) => updateField("country_code", event.target.value)}
              required
            >
              <option value="IN">India</option>
            </select>
            {fieldErrors.country_code && <span role="alert" style={{ display: "block", color: "#b42318", marginTop: 4 }}>{fieldErrors.country_code}</span>}
          </label>

          {fields.map(({ key, label, required, placeholder }) => (
            <label key={key} style={{ display: "block", marginTop: 14 }}>
              {label}
              <input
                value={form[key] ?? ""}
                onChange={(event) => updateField(key, event.target.value)}
                required={required}
                placeholder={placeholder}
                maxLength={key === "address_line1" || key === "address_line2" ? 200 : 150}
                style={{ display: "block", width: "100%", marginTop: 6, padding: 10, borderColor: fieldErrors[key] ? "#b42318" : undefined }}
                aria-invalid={Boolean(fieldErrors[key])}
                aria-describedby={fieldErrors[key] ? `address-error-${key}` : undefined}
              />
              {fieldErrors[key] && <span id={`address-error-${key}`} role="alert" style={{ display: "block", color: "#b42318", marginTop: 4 }}>{fieldErrors[key]}</span>}
            </label>
          ))}

          <div style={{ display: "flex", gap: 12, marginTop: 20, flexWrap: "wrap" }}>
            <button type="submit" disabled={saving}>
              {saving ? "Saving…" : editingId ? "Update address" : "Save address"}
            </button>
            {editingId && (
              <button type="button" onClick={cancelEdit} disabled={saving}>
                Cancel
              </button>
            )}
          </div>
        </form>

        <div style={{ marginTop: 32 }}>
          <h2>Saved addresses</h2>
          {loading ? (
            <p>Loading addresses…</p>
          ) : addresses.length === 0 ? (
            <p className="muted">You have not saved any addresses yet.</p>
          ) : (
            <div style={{ display: "grid", gap: 16 }}>
              {addresses.map((address) => (
                <article className="empty" key={address.id}>
                  <h3>{address.address_type === "billing" ? "Billing" : "Shipping"} — {address.recipient_name}</h3>
                  <p>{address.phone_e164}</p>
                  <p>
                    {address.address_line1}
                    {address.address_line2 ? `, ${address.address_line2}` : ""}
                    {address.landmark ? `, ${address.landmark}` : ""}
                  </p>
                  <p>
                    {address.locality}, {address.city}, {address.state} — {address.postal_code}
                  </p>
                  <p>{address.country_code}</p>
                  <div style={{ display: "flex", gap: 12 }}>
                    <button type="button" onClick={() => startEdit(address)}>Edit</button>
                    <button type="button" onClick={() => void deleteAddress(address.id)}>Delete</button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
