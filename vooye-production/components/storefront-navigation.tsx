"use client";

import { useState } from "react";
import Link from "next/link";
import ProfileLink from "@/components/profile-link";

export default function StorefrontNavigation() {
  const [open, setOpen] = useState(false);

  return (
    <div className="storefront-navigation">
      <div className="navigation-actions">
        <span className="desktop-profile"><ProfileLink /></span>
        <button
        type="button"
        className="menu-toggle"
        aria-label={open ? "Close navigation menu" : "Open navigation menu"}
        aria-expanded={open}
        aria-controls="storefront-menu"
        onClick={() => setOpen((value) => !value)}
      >
        <span aria-hidden="true">{open ? "×" : "☰"}</span>
        <span className="menu-toggle-label">{open ? "Close" : "Menu"}</span>
        </button>
      </div>
      <nav id="storefront-menu" className={`nav storefront-menu${open ? " is-open" : ""}`} aria-label="Main navigation">
        <Link href="/#shop" onClick={() => setOpen(false)}>Shop / Products</Link>
        <Link href="/account/orders" onClick={() => setOpen(false)}>My orders</Link>
        <Link href="/cart" onClick={() => setOpen(false)}>Cart</Link>
        <a href="mailto:support@vooye.in" onClick={() => setOpen(false)}>Support / Contact</a>
      </nav>
    </div>
  );
}
