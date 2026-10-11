import "server-only";
import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { parseShippingFee } from "@/lib/money";
import { checkoutSchema } from "@/lib/validation";

export async function createOrder(firebaseUid: string, email: string | undefined, raw: unknown) {
  const input = checkoutSchema.parse(raw);
  const compact = new Map<string, number>();
  for (const item of input.items) compact.set(item.productId, (compact.get(item.productId) ?? 0) + item.quantity);
  if ([...compact.values()].some(q => q > 10)) throw new Error("QUANTITY_LIMIT");
  const ids = [...compact.keys()];
  const customer = await db.customer.upsert({ where: { firebaseUid }, create: { firebaseUid, email: email ?? null }, update: { email: email ?? undefined } });
  const shipping = parseShippingFee();
  const orderNumber = `VOO-${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString("hex").toUpperCase()}`;
  return db.$transaction(async tx => {
    // Prices and stock are re-read inside the same transaction used to reserve inventory.
    const products = await tx.product.findMany({ where: { id: { in: ids }, active: true } });
    if (products.length !== ids.length) throw new Error("PRODUCT_UNAVAILABLE");
    const subtotal = products.reduce((sum, p) => sum + p.pricePaise * (compact.get(p.id) ?? 0), 0);
    if (!Number.isSafeInteger(subtotal) || subtotal <= 0 || subtotal > 100000000) throw new Error("INVALID_TOTAL");
    for (const [productId, quantity] of compact.entries()) {
      const changed = await tx.product.updateMany({ where: { id: productId, active: true, stock: { gte: quantity } }, data: { stock: { decrement: quantity } } });
      if (changed.count !== 1) throw new Error("OUT_OF_STOCK");
    }
    return tx.order.create({ data: {
      orderNumber, customerId: customer.id,
      status: input.paymentMethod === "COD" ? "CONFIRMED" : "PENDING",
      paymentStatus: "PENDING", paymentMethod: input.paymentMethod,
      subtotalPaise: subtotal, shippingPaise: shipping, totalPaise: subtotal + shipping,
      recipientName: input.recipientName, phone: input.phone, addressLine1: input.addressLine1,
      addressLine2: input.addressLine2 || null, city: input.city, state: input.state, postalCode: input.postalCode, notes: input.notes || null,
      items: { create: products.map(p => { const quantity = compact.get(p.id)!; return { productId: p.id, productName: p.name, unitPricePaise: p.pricePaise, quantity, lineTotalPaise: p.pricePaise * quantity }; }) }
    }, include: { items: true } });
  });
}
