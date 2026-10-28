import { describe, expect, it } from "vitest";
import { isAuthorizedBearer } from "../lib/cron-auth";

describe("cron Bearer authorization", () => {
  const secret = "test-cron-secret";

  it("accepts a valid Bearer token", () => {
    const request = new Request("https://example.test/api/cron", {
      headers: { authorization: `Bearer ${secret}` },
    });
    expect(isAuthorizedBearer(request, secret)).toBe(true);
  });

  it("accepts case-insensitive scheme and extra whitespace", () => {
    const request = new Request("https://example.test/api/cron", {
      headers: { authorization: `bEaReR   ${secret}  ` },
    });
    expect(isAuthorizedBearer(request, secret)).toBe(true);
  });

  it("rejects missing or malformed authorization", () => {
    expect(isAuthorizedBearer(new Request("https://example.test"), secret)).toBe(false);
    expect(isAuthorizedBearer(new Request("https://example.test", {
      headers: { authorization: `Bearer\\s${secret}` },
    }), secret)).toBe(false);
  });

  it("rejects a missing configured secret and incorrect token", () => {
    const request = new Request("https://example.test", {
      headers: { authorization: "Bearer wrong-secret" },
    });
    expect(isAuthorizedBearer(request, undefined)).toBe(false);
    expect(isAuthorizedBearer(request, secret)).toBe(false);
  });
});
