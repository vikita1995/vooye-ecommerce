import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { verifyIdTokenMock } = vi.hoisted(() => ({
  verifyIdTokenMock: vi.fn(),
}));

vi.mock("firebase-admin/app", () => ({
  applicationDefault: vi.fn(() => ({})),
  getApps: vi.fn(() => []),
  initializeApp: vi.fn(() => ({ name: "customer-profile-test" })),
}));

vi.mock("firebase-admin/auth", () => ({
  getAuth: vi.fn(() => ({
    verifyIdToken: verifyIdTokenMock,
  })),
}));

import {
  GET as getProfile,
  PATCH as patchProfile,
} from "../app/api/customer/profile/route";

const TEST_UID = "firebase-user-123";
const TEST_EMAIL = "customer@example.com";

type Customer = {
  id: string;
  firebase_uid: string;
  full_name: string | null;
  email: string | null;
  phone_e164: string | null;
  email_verified_at: string | null;
  phone_verified_at: string | null;
  date_of_birth: string | null;
  gender: "male" | "female" | "other" | null;
  registration_completed_at: string | null;
  status: string;
};

function customer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: "customer-row-1",
    firebase_uid: TEST_UID,
    full_name: "Test Customer",
    email: TEST_EMAIL,
    phone_e164: null,
    email_verified_at: null,
    phone_verified_at: null,
    date_of_birth: null,
    gender: null,
    registration_completed_at: null,
    status: "active",
    ...overrides,
  };
}

function request(
  method: "GET" | "PATCH",
  body?: Record<string, unknown>,
  token = "valid-firebase-token",
) {
  return new NextRequest("http://localhost/api/customer/profile", {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function configureEnvironment() {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://supabase.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
  process.env.FIREBASE_ADMIN_PROJECT_ID = "vooye-test";
}

describe("customer profile API", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    configureEnvironment();

    verifyIdTokenMock.mockResolvedValue({
      uid: TEST_UID,
      email: TEST_EMAIL,
      email_verified: true,
      name: "Test Customer",
    });

    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("handles concurrent GET requests without creating duplicate profiles", async () => {
    let storedProfile: Customer | null = null;
    let initialLookups = 0;
    let insertAttempts = 0;

    fetchMock.mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input));
        const method = (init?.method ?? "GET").toUpperCase();

        if (method === "GET" && url.pathname.endsWith("/customers")) {
          // Both requests first observe a missing profile.
          initialLookups += 1;

          if (initialLookups <= 2) {
            return jsonResponse([]);
          }

          return jsonResponse(storedProfile ? [storedProfile] : []);
        }

        if (method === "POST" && url.pathname.endsWith("/customers")) {
          insertAttempts += 1;

          if (storedProfile) {
            // Mirrors PostgREST resolution=ignore-duplicates behavior.
            return jsonResponse([]);
          }

          storedProfile = customer();
          return jsonResponse([storedProfile], 201);
        }

        return jsonResponse({ message: "Unexpected request" }, 500);
      },
    );

    const [firstResponse, secondResponse] = await Promise.all([
      getProfile(request("GET")),
      getProfile(request("GET")),
    ]);

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);

    const firstBody = (await firstResponse.json()) as {
      customer: Customer;
    };
    const secondBody = (await secondResponse.json()) as {
      customer: Customer;
    };

    expect(firstBody.customer.firebase_uid).toBe(TEST_UID);
    expect(secondBody.customer.firebase_uid).toBe(TEST_UID);
    expect(insertAttempts).toBe(2);
    expect(storedProfile).not.toBeNull();
  });

  it("returns 403 for a blocked customer and does not create a profile", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse([customer({ status: "blocked" })]),
    );

    const response = await getProfile(request("GET"));

    expect(response.status).toBe(403);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    expect(String(fetchMock.mock.calls[0][0])).toContain(
      `firebase_uid=eq.${encodeURIComponent(TEST_UID)}`,
    );

    // Fixed: let TypeScript infer the mock call's type.
    expect(
      fetchMock.mock.calls.some((call) => call[1]?.method === "POST"),
    ).toBe(false);
  });

  it("returns 401 for an invalid Firebase token without calling Supabase", async () => {
    verifyIdTokenMock.mockRejectedValueOnce(new Error("invalid token"));

    const response = await getProfile(
      request("GET", undefined, "invalid-token"),
    );

    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    "status",
    "firebase_uid",
    "email",
    "email_verified_at",
    "phone_verified_at",
    "registration_completed_at",
  ])("rejects PATCH attempts to change protected field %s", async (field) => {
    fetchMock.mockResolvedValueOnce(jsonResponse([customer()]));

    const response = await patchProfile(
      request("PATCH", { [field]: "attacker-controlled-value" }),
    );

    expect(response.status).toBe(400);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Fixed: let TypeScript infer the mock call's type.
    expect(
      fetchMock.mock.calls.some((call) => call[1]?.method === "PATCH"),
    ).toBe(false);
  });

  it("queries the profile using the verified Firebase UID", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([customer()]));

    const response = await getProfile(request("GET"));

    expect(response.status).toBe(200);

    expect(String(fetchMock.mock.calls[0][0])).toContain(
      `firebase_uid=eq.${encodeURIComponent(TEST_UID)}`,
    );

    expect(String(fetchMock.mock.calls[0][0])).not.toContain(
      "customer-supplied-uid",
    );
  });
});
