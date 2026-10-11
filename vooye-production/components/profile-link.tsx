"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { onAuthStateChanged, type User } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase-client";

export default function ProfileLink() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const unsubscribe = onAuthStateChanged(
        getFirebaseAuth(),
        (currentUser) => {
          setUser(currentUser);
          setReady(true);
        }
      );

      return unsubscribe;
    } catch (error) {
      console.error("Firebase authentication initialization failed:", error);
      setReady(true);
    }
  }, []);

  const label = user
    ? user.displayName?.trim() || "My account"
    : "Sign in";

  return (
    <Link
      href={user ? "/account" : "/sign-in"}
      className="profile-link"
      aria-label={user ? `Open ${label}` : "Sign in to your account"}
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
        <span className="profile-avatar profile-avatar-fallback">
          {user?.displayName?.trim()?.charAt(0).toUpperCase() || "♙"}
        </span>
      )}

      <span>{ready ? label : "Account"}</span>
    </Link>
  );
}