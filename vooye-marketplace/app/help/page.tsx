"use client";

import { useState } from "react";

export default function Help() {
  const [f, setF] = useState({
    name: "",
    email: "",
    order: "",
    topic: "Order status",
    message: "",
  });
  const [sent, setSent] = useState(false);

  function u(k: keyof typeof f, v: string) {
    setF((p) => ({ ...p, [k]: v }));
  }

  return (
    <div className="wrap page">
      <div className="eyebrow">We&apos;re here to help</div>
      <h1>How can we help?</h1>
      <p className="muted">
        This starter form validates locally; it does not yet send or store
        support tickets.
      </p>

      <div className="two">
        <div className="panel stack">
          <h2>Contact support</h2>
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              setSent(true);
            }}
          >
            <label>
              Your name
              <input
                required
                value={f.name}
                onChange={(e) => u("name", e.target.value)}
              />
            </label>

            <label>
              Email
              <input
                type="email"
                required
                value={f.email}
                onChange={(e) => u("email", e.target.value)}
              />
            </label>

            <label>
              Order number (optional)
              <input
                value={f.order}
                onChange={(e) => u("order", e.target.value)}
              />
            </label>

            <label>
              Topic
              <select
                value={f.topic}
                onChange={(e) => u("topic", e.target.value)}
              >
                {[
                  "Order status",
                  "Product question",
                  "Return or refund",
                  "Damaged delivery",
                  "Payment",
                  "Other",
                ].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>

            <label>
              Message
              <textarea
                rows={5}
                required
                value={f.message}
                onChange={(e) => u("message", e.target.value)}
              />
            </label>

            <button type="submit">Prepare request</button>
          </form>

          {sent && (
            <div className="notice">
              Form validated. Ticket delivery is not configured; connect a
              secure support API before launch.
            </div>
          )}
        </div>

        <div className="panel">
          <h2>Frequently asked questions</h2>

          <div className="item">
            <b>How can I track an order?</b>
            <p className="muted small">
              Use Track order after live ordering is enabled.
            </p>
          </div>

          <div className="item">
            <b>My mirror arrived damaged.</b>
            <p className="muted small">
              Keep packaging and photos and contact support promptly.
            </p>
          </div>

          <div className="item">
            <b>How do returns work?</b>
            <p className="muted small">
              See the published returns policy before ordering.
            </p>
          </div>

          <a href="/returns">Returns &amp; refunds →</a>
        </div>
      </div>
    </div>
  );
}