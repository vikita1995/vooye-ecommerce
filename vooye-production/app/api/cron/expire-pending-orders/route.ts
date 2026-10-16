import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

function hash(value: unknown) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function authorized(request: Request) {
  const expected = process.env.CRON_SECRET ?? "";
  const provided = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? "";
  if (!expected || !provided) return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(provided);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export async function POST(request: Request) {
  if (!process.env.CRON_SECRET) {
    return fail("Order expiry job is not configured.", 503);
  }
  if (!authorized(request)) return fail("Unauthorized.", 401);

  const now = new Date();
  let candidates: { id: string }[];
  try {
    candidates = await db.order.findMany({
      where: {
        status: "PENDING_PAYMENT",
        paymentStatus: "CREATED",
        paymentExpiresAt: { lte: now },
      },
      select: { id: true },
      orderBy: { paymentExpiresAt: "asc" },
      take: 100,
    });
  } catch (cause) {
    const code = cause instanceof Error ? cause.message : "Unknown error";
    console.error("Pending order expiry lookup failed:", code);
    return fail("Unable to expire pending orders.", 500);
  }

  let expired = 0;
  let skipped = 0;
  for (const candidate of candidates) {
    try {
      const didExpire = await db.$transaction(async (tx) => {
        const claimed = await tx.order.updateMany({
          where: {
            id: candidate.id,
            status: "PENDING_PAYMENT",
            paymentStatus: "CREATED",
            paymentExpiresAt: { lte: now },
          },
          data: { status: "CANCELLED", paymentStatus: "FAILED" },
        });
        if (claimed.count !== 1) return false;

        const reservation = await tx.paymentEvent.findUnique({
          where: { providerEventId: "inventory_reserved:" + candidate.id },
        });
        const releaseKey = "inventory_released:" + candidate.id;
        const released = await tx.paymentEvent.findUnique({ where: { providerEventId: releaseKey } });

        if (reservation && !released) {
          const items = await tx.orderItem.findMany({ where: { orderId: candidate.id } });
          for (const item of items) {
            await tx.product.update({
              where: { id: item.productId },
              data: { stock: { increment: item.quantity } },
            });
          }
        }

        if (!released) {
          await tx.paymentEvent.create({
            data: {
              orderId: candidate.id,
              providerEventId: releaseKey,
              eventType: reservation ? "inventory.released.order_expired" : "inventory.release_skipped_unreserved.order_expired",
              payloadHash: hash({ orderId: candidate.id, hadReservation: Boolean(reservation), expiredAt: now.toISOString() }),
            },
          });
        }
        await tx.paymentEvent.create({
          data: {
            orderId: candidate.id,
            providerEventId: "order_expired:" + candidate.id,
            eventType: "order.expired",
            payloadHash: hash({ orderId: candidate.id, expiredAt: now.toISOString() }),
          },
        });
        return true;
      });

      if (didExpire) expired += 1;
      else skipped += 1;
    } catch (cause) {
      skipped += 1;
      const code = cause instanceof Error ? cause.message : "Unknown error";
      console.error("Pending order expiry item failed:", code);
    }
  }

  return NextResponse.json({ inspected: candidates.length, expired, skipped }, {
    headers: { "Cache-Control": "no-store" },
  });
}
