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

  const label = user ? "My account" : "Sign in";

  return (
    <Link
      href={user ? "/account" : "/sign-in"}
      className="profile-link"
      aria-label={user ? "Open my account" : "Sign in to your account"}
      title={label}
    >
      {user?.photoURL ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={user.photoURL}
          alt=""
          className="profile-avatar"
          referrerPolicy="no-referrer"
        />
      ) : (
        <span className="profile-avatar profile-avatar-fallback" aria-hidden="true">
          ♙
        </span>
      )}

      <span>{ready ? label : "Account"}</span>
    </Link>
  );
}
