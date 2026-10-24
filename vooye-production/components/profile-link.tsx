"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { onAuthStateChanged, type User } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase-client";

export default function ProfileLink() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    try {
      unsubscribe = onAuthStateChanged(getFirebaseAuth(), (currentUser) => {
        if (cancelled) return;
        setUser(currentUser);
        setReady(true);
      });
    } catch (error) {
      console.error("Firebase authentication initialization failed:", error);
      setReady(true);
    }

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  const displayName = user?.displayName?.trim() || "";
  const firstName = displayName.split(/\s+/)[0] || "";
  const initial = firstName.charAt(0).toUpperCase();

  return (
    <Link
      href={user ? "/account" : "/sign-in"}
      className="profile-link"
      aria-label={user ? "Open my account" : "Sign in to your account"}
      title={user ? "My account" : "Sign in"}
    >
      <span className="profile-avatar profile-avatar-fallback" aria-hidden="true">
        {ready && user ? initial : ""}
      </span>
    </Link>
  );
}
