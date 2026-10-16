import http from "node:http";
import { Webhook } from "standardwebhooks";

const PORT = Number(process.env.PORT || 8080);
const HOOK_SECRET = process.env.SUPABASE_SEND_SMS_HOOK_SECRET;
const MSG91_AUTHKEY = process.env.MSG91_AUTHKEY;
const MSG91_TEMPLATE_ID = process.env.MSG91_TEMPLATE_ID;

function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function getWebhookSecret(value) {
  if (!value) throw new Error("Missing hook signing secret");
  // Supabase supplies secrets as v1,whsec_<base64-secret>.
  const match = value.match(/(?:^|,)whsec_([^,|]+)/);
  if (!match) throw new Error("Hook secret must use the Supabase v1,whsec_ format");
  return match[1];
}

async function readBody(req) {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (Buffer.byteLength(body, "utf8") > 20_000) {
      const error = new Error("Request body too large");
      error.status = 413;
      throw error;
    }
  }
  return body;
}

async function sendOtp(phone, otp) {
  if (!MSG91_AUTHKEY || !MSG91_TEMPLATE_ID) {
    throw new Error("MSG91 credentials/template are not configured");
  }
  // MSG91 Flow API expects country code without the leading plus.
  const mobiles = phone.replace(/^\+/, "");
  if (!/^\d{8,15}$/.test(mobiles)) throw new Error("Invalid destination phone number");

  const response = await fetch("https://control.msg91.com/api/v5/flow", {
    method: "POST",
    headers: {
      accept: "application/json",
      authkey: MSG91_AUTHKEY,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      template_id: MSG91_TEMPLATE_ID,
      recipients: [{ mobiles, VAR1: otp }],
    }),
    signal: AbortSignal.timeout(10_000),
  });

  const responseText = await response.text();
  let result;
  try { result = JSON.parse(responseText); } catch { result = {}; }

  if (!response.ok || result.type === "error" || result.status === "error") {
    // Do not log the OTP, phone number, credentials, or provider response body.
    throw new Error(`MSG91 rejected the SMS request (HTTP ${response.status})`);
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/healthz") {
    return json(res, 200, { status: "ok" });
  }
  if (req.method !== "POST" || req.url !== "/hooks/supabase/send-sms") {
    return json(res, 404, { error: "not_found" });
  }

  try {
    if (!HOOK_SECRET) return json(res, 500, { error: "hook_not_configured" });
    const payload = await readBody(req);
    const webhook = new Webhook(getWebhookSecret(HOOK_SECRET));
    const headers = Object.fromEntries(
      Object.entries(req.headers).map(([key, value]) => [key, Array.isArray(value) ? value.join(",") : value ?? ""])
    );
    const event = webhook.verify(payload, headers);
    const phone = event?.user?.phone;
    const otp = event?.sms?.otp;

    if (typeof phone !== "string" || typeof otp !== "string" || !/^\d{4,10}$/.test(otp)) {
      return json(res, 400, { error: "invalid_hook_payload" });
    }

    await sendOtp(phone, otp);
    return json(res, 200, {});
  } catch (error) {
    const status = Number.isInteger(error?.status) ? error.status : 500;
    // Avoid logging request bodies or provider responses because they may contain OTP/PII.
    console.error("Supabase SMS hook failed:", error instanceof Error ? error.message : "unknown error");
    return json(res, status, { error: status === 413 ? "payload_too_large" : "sms_delivery_failed" });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Supabase MSG91 SMS hook listening on port ${PORT}`);
});
