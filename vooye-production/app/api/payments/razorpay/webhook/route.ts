import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { verifyWebhookSignature } from "@/lib/razorpay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RazorpayPaymentEntity = {
  id?: string;
  order_id?: string;
  status?: string;
  amount?: number;
  currency?: string;
};

type RazorpayWebhook = {
  event?: string;
  payload?: { payment?: { entity?: RazorpayPaymentEntity } };
};

function response(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function hash(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function isUniqueConstraintError(cause: unknown) {
  return cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === "P2002";
}

async function recordEvent(orderId: string, key: string, eventType: string, raw: string) {
  try {
    await db.paymentEvent.create({
      data: {
        orderId,
        providerEventId: key,
        eventType,
        payloadHash: hash(raw),
      },
    });
  } catch (cause) {
    if (!isUniqueConstraintError(cause)) throw cause;
  }
}

export async function POST(request: Request) {
  const raw = await request.text();
  const signature = request.headers.get("x-razorpay-signature") ?? "";
  if (!signature || !verifyWebhookSignature(raw, signature)) {
    return response({ error: "Invalid webhook signature." }, 400);
  }

  let event: RazorpayWebhook;
  try {
    event = JSON.parse(raw) as RazorpayWebhook;
  } catch {
    return response({ error: "Invalid webhook body." }, 400);
  }

  const entity = event.payload?.payment?.entity;
  if (!event.event || !entity?.id || !entity.order_id) {
    // Ignore verified events we do not process; they should not be retried.
    return response({ received: true, ignored: true });
  }

  const razorpayEventId = request.headers.get("x-razorpay-event-id")?.trim();
  const eventKey = `webhook:${razorpayEventId || hash(raw)}`;

  try {
    const existingEvent = await db.paymentEvent.findUnique({ where: { providerEventId: eventKey } });
    if (existingEvent) return response({ received: true, duplicate: true });

    const order = await db.order.findFirst({
      where: { razorpayOrderId: entity.order_id },
    });
    if (!order) {
      // No internal order references this provider event. Log a correlation ID
      // only; don't log the raw request or secrets.
      console.error("Razorpay webhook references an unknown order", { providerOrderId: entity.order_id, event: event.event });
      return response({ received: true, reconciliationRequired: true });
    }

    if (event.event === "payment.failed") {
      await db.$transaction(async (tx) => {
        const claimed = await tx.order.updateMany({
          where: {
            id: order.id,
            status: "PENDING_PAYMENT",
            paymentStatus: "CREATED",
            razorpayOrderId: entity.order_id,
          },
          data: { status: "CANCELLED", paymentStatus: "FAILED" },
        });
        if (claimed.count === 1) {
          const reservation = await tx.paymentEvent.findUnique({
            where: { providerEventId: "inventory_reserved:" + order.id },
          });
          const releaseKey = "inventory_released:" + order.id;
          const released = await tx.paymentEvent.findUnique({ where: { providerEventId: releaseKey } });
          if (reservation && !released) {
            const items = await tx.orderItem.findMany({ where: { orderId: order.id } });
            for (const item of items) {
              await tx.product.update({
                where: { id: item.productId },
                data: { stock: { increment: item.quantity } },
              });
            }
            await tx.paymentEvent.create({
              data: {
                orderId: order.id,
                providerEventId: releaseKey,
                eventType: "inventory.released.payment_failed",
                payloadHash: hash(raw),
              },
            });
          }
        }
        await tx.paymentEvent.create({
          data: {
            orderId: order.id,
            providerEventId: eventKey,
            eventType: claimed.count === 1 ? "payment.failed" : "payment.failed_after_order_state_change",
            payloadHash: hash(raw),
          },
        });
      });
      return response({ received: true });
    }

    if (event.event !== "payment.captured") {
      return response({ received: true, ignored: true });
    }

    if (
      entity.status !== "captured" ||
      Number(entity.amount) !== order.totalPaise ||
      entity.currency !== order.currency
    ) {
      await recordEvent(order.id, eventKey, "payment.captured_mismatch", raw);
      console.error("Razorpay captured payment needs amount/currency reconciliation", { orderId: order.id });
      return response({ received: true, reconciliationRequired: true });
    }

    if (order.status === "PAID" && order.paymentStatus === "CAPTURED" && order.razorpayPaymentId === entity.id) {
      await recordEvent(order.id, eventKey, "payment.captured_duplicate_after_confirmation", raw);
      return response({ received: true, duplicate: true });
    }

    const reservation = await db.paymentEvent.findUnique({
      where: { providerEventId: "inventory_reserved:" + order.id },
    });
    if (!reservation) {
      await recordEvent(order.id, eventKey, "payment.captured_inventory_reservation_missing", raw);
      console.error("Captured payment has no reservation; support reconciliation required", { orderId: order.id });
      return response({ received: true, reconciliationRequired: true });
    }

    if (
      order.status !== "PENDING_PAYMENT" ||
      order.paymentStatus !== "CREATED" ||
      (order.paymentExpiresAt && order.paymentExpiresAt <= new Date())
    ) {
      await recordEvent(order.id, eventKey, "payment.captured_needs_reconciliation", raw);
      console.error("Late or unexpected Razorpay capture requires reconciliation", { orderId: order.id, status: order.status });
      return response({ received: true, reconciliationRequired: true });
    }

    try {
      const state = await db.$transaction(async (tx) => {
        const claimed = await tx.order.updateMany({
          where: {
            id: order.id,
            razorpayOrderId: entity.order_id,
            status: "PENDING_PAYMENT",
            paymentStatus: "CREATED",
            OR: [{ paymentExpiresAt: null }, { paymentExpiresAt: { gt: new Date() } }],
          },
          data: {
            status: "PAID",
            paymentStatus: "CAPTURED",
            razorpayPaymentId: entity.id,
          },
        });

        if (claimed.count !== 1) {
          const current = await tx.order.findUnique({ where: { id: order.id } });
          const samePaymentAlreadyCaptured = current?.status === "PAID" &&
            current.paymentStatus === "CAPTURED" &&
            current.razorpayPaymentId === entity.id;
          await tx.paymentEvent.create({
            data: {
              orderId: order.id,
              providerEventId: eventKey,
              eventType: samePaymentAlreadyCaptured ? "payment.captured_duplicate_after_confirmation" : "payment.captured_needs_reconciliation",
              payloadHash: hash(raw),
            },
          });
          return samePaymentAlreadyCaptured ? "duplicate" as const : "reconciliation" as const;
        }

        // Stock was reserved atomically before the Razorpay order was created.

        await tx.paymentEvent.create({
          data: { orderId: order.id, providerEventId: eventKey, eventType: "payment.captured", payloadHash: hash(raw) },
        });
        return "captured" as const;
      });

      if (state === "reconciliation") {
        console.error("Razorpay capture raced with an order state change", { orderId: order.id });
        return response({ received: true, reconciliationRequired: true });
      }
      return response({ received: true, duplicate: state === "duplicate" });
    } catch (cause) {
      if (isUniqueConstraintError(cause)) {
        return response({ received: true, duplicate: true });
      }

      throw cause;
    }
  } catch (cause) {
    if (isUniqueConstraintError(cause)) {
      return response({ received: true, duplicate: true });
    }
    const code = cause instanceof Error ? cause.message : "Unknown error";
    console.error("Razorpay webhook processing failed:", code);
    return response({ error: "Webhook processing failed. Please retry." }, 500);
import { tryIssueInvoiceForPaidOrder } from "@/lib/invoices";
export const runtime="nodejs";
export async function POST(request:Request){
 const raw=await request.text();const signature=request.headers.get("x-razorpay-signature")||"";
 try{
  if(!verifyWebhookSignature(raw,signature))return NextResponse.json({error:"Invalid signature"},{status:400});
  const event=JSON.parse(raw) as {event?:string;payload?:{payment?:{entity?:{id?:string;order_id?:string;status?:string}}};id?:string};
  const entity=event.payload?.payment?.entity;
  if(event.event==="payment.captured"&&entity?.id&&entity.order_id){
   const order=await db.order.findFirst({where:{razorpayOrderId:entity.order_id}});
   if(order && order.status==="PENDING_PAYMENT" && order.paymentStatus==="CREATED" && (!order.paymentExpiresAt||order.paymentExpiresAt>new Date())){
    await db.$transaction(async tx=>{
     const key=event.id||crypto.createHash("sha256").update(raw).digest("hex");
     const already=await tx.paymentEvent.findUnique({where:{providerEventId:key}});
     if(already)return;
     const items=await tx.orderItem.findMany({where:{orderId:order.id}});
     for(const item of items){const changed=await tx.product.updateMany({where:{id:item.productId,stock:{gte:item.quantity},status:"ACTIVE"},data:{stock:{decrement:item.quantity}}});if(changed.count!==1)throw new Error("Inventory conflict");}
     await tx.order.update({where:{id:order.id},data:{status:"PAID",paymentStatus:"CAPTURED",razorpayPaymentId:entity.id}});
     await tx.paymentEvent.create({data:{orderId:order.id,providerEventId:key,eventType:event.event||"unknown",payloadHash:crypto.createHash("sha256").update(raw).digest("hex")}});
    });
   }
   if (order) {
    // Invoice configuration errors must not cause Razorpay retries for a captured payment.
    await tryIssueInvoiceForPaidOrder(order.id);
   }
  }
}
