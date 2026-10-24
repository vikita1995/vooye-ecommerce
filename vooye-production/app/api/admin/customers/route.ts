import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "private, no-store" } });
}

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);
    const params = request.nextUrl.searchParams;
    const query = (params.get("q") ?? "").trim().slice(0, 100);
    const page = Math.max(1, Math.min(10000, Number(params.get("page") ?? "1") || 1));
    const pageSize = Math.max(1, Math.min(50, Number(params.get("pageSize") ?? "20") || 20));
    const where = {
      role: "CUSTOMER" as const,
      ...(query ? { OR: [
        { email: { contains: query, mode: "insensitive" as const } },
        { displayName: { contains: query, mode: "insensitive" as const } },
        { firebaseUid: { contains: query } },
      ] } : {}),
    };
    const [total, users] = await db.$transaction([
      db.user.count({ where }),
      db.user.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true, firebaseUid: true, email: true, displayName: true,
          createdAt: true, updatedAt: true,
          _count: { select: { orders: true } },
          orders: {
            orderBy: { createdAt: "desc" },
            take: 3,
            select: { id: true, orderNumber: true, status: true, paymentStatus: true, totalPaise: true, currency: true, createdAt: true },
          },
        },
      }),
    ]);
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    let profiles: Record<string, { phone_e164: string | null; phone_verified_at: string | null; status: string }> = {};
    if (supabaseUrl && serviceKey && users.length) {
      const uidList = users.map((user) => user.firebaseUid);
      const profileResponse = await fetch(
        `${supabaseUrl}/rest/v1/customers?firebase_uid=in.(${uidList.map(encodeURIComponent).join(",")})&select=firebase_uid,phone_e164,phone_verified_at,status`,
        { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }, cache: "no-store" },
      );
      if (!profileResponse.ok) {
        console.error("Admin customer profile lookup failed", profileResponse.status);
      } else {
        const rows = await profileResponse.json() as Array<{ firebase_uid: string; phone_e164: string | null; phone_verified_at: string | null; status: string }>;
        profiles = Object.fromEntries(rows.map((row) => [row.firebase_uid, { phone_e164: row.phone_e164, phone_verified_at: row.phone_verified_at, status: row.status }]));
      }
    }
    return NextResponse.json({
      customers: users.map((user) => ({
        id: user.id,
        name: user.displayName,
        email: user.email.endsWith("@users.vooye.invalid") ? null : user.email,
        registeredAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
        orderCount: user._count.orders,
        recentOrders: user.orders.map((order) => ({ ...order, createdAt: order.createdAt.toISOString() })),
        phone: profiles[user.firebaseUid]?.phone_e164 ?? null,
        phoneVerified: Boolean(profiles[user.firebaseUid]?.phone_verified_at),
        accountStatus: profiles[user.firebaseUid]?.status ?? "unknown",
      })),
      page, pageSize, total, totalPages: Math.ceil(total / pageSize),
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (cause) {
    const code = cause instanceof Error ? cause.message : "";
    if (["Authentication required", "Authentication invalid or expired", "AUTH_REQUIRED", "AUTH_INVALID"].includes(code)) return fail("Administrator sign-in is required.", 401);
    if (code === "Forbidden") return fail("Administrator access required.", 403);
    console.error("Admin customers API failed", code || "Unknown error");
    return fail("Unable to load customer records.", 500);
  }
}
