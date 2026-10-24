"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { onAuthStateChanged, type User } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase-client";
import ProfileLink from "@/components/profile-link";

export default function StorefrontNavigation() {
  const [open, setOpen] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(getFirebaseAuth(), (currentUser) => {
      setUser(currentUser);
      setAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  function closeMenu() {
    setOpen(false);
  }

  return (
    <div className="storefront-navigation">
      <div className="navigation-actions">
        <span className="desktop-profile">
          <ProfileLink />
        </span>
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

      <nav
        id="storefront-menu"
        className={`nav storefront-menu${open ? " is-open" : ""}`}
        aria-label="Main navigation"
      >
        <Link href="/#shop" onClick={closeMenu}>Shop / Products</Link>
        {authReady && (
          <Link href={user ? "/account" : "/sign-in"} onClick={closeMenu}>
            {user ? "My account" : "Sign in"}
          </Link>
        )}
        {user && <Link href="/account/orders" onClick={closeMenu}>My orders</Link>}
        <Link href="/cart" onClick={closeMenu}>Cart</Link>
        <a href="mailto:support@vooye.in" onClick={closeMenu}>Support / Contact</a>
      </nav>
    </div>
  );
}
