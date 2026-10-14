
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  onAuthStateChanged,
  type User,
} from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase-client";

type CustomerProfile = {
  full_name: string | null;
};

export default function ProfileLink() {
  const [user, setUser] = useState<User | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let unsubscribeAuth: (() => void) | undefined;
    let requestNumber = 0;

    try {
      const auth = getFirebaseAuth();

      unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
        const currentRequest = ++requestNumber;

        if (cancelled) return;

        setUser(currentUser);
        setCustomerName("");

        if (!currentUser) {
          setReady(true);
          return;
        }

        setReady(false);

        try {
          const token = await currentUser.getIdToken();

          const response = await fetch("/api/customer/profile", {
            method: "GET",
            headers: {
              Authorization: `Bearer ${token}`,
            },
            cache: "no-store",
          });

          if (!response.ok) {
            throw new Error(
              `Customer profile request failed: ${response.status}`
            );
          }

          const result = (await response.json()) as {
            customer?: CustomerProfile;
          };

          if (
            !cancelled &&
            currentRequest === requestNumber &&
            auth.currentUser?.uid === currentUser.uid
          ) {
            setCustomerName(result.customer?.full_name?.trim() || "");
          }
        } catch (error) {
          // Keep the header usable if the profile API is temporarily unavailable.
          console.error("Unable to load customer name:", error);
        } finally {
          if (!cancelled && currentRequest === requestNumber) {
            setReady(true);
          }
        }
      });
    } catch (error) {
      console.error("Firebase authentication initialization failed:", error);
      setReady(true);
    }

    return () => {
      cancelled = true;
      unsubscribeAuth?.();
    };
  }, []);

  const label = user
    ? customerName ||
      user.displayName?.trim() ||
      "My account"
    : "Sign in";

  const initial =
    customerName.charAt(0).toUpperCase() ||
    user?.displayName?.trim()?.charAt(0).toUpperCase() ||
    "♙";

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
          {initial}
        </span>
      )}

      <span>{ready ? label : "Account"}</span>
    </Link>
  );
}
