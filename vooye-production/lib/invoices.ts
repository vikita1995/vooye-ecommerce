import type { Invoice } from "@/generated/prisma/client";
import { db } from "@/lib/db";

export class InvoiceConfigurationError extends Error {
  constructor() {
    super("Invoice business details are not configured. Set INVOICE_SELLER_LEGAL_NAME and INVOICE_SELLER_ADDRESS.");
    this.name = "InvoiceConfigurationError";
  }
}

export class InvoiceNotReadyError extends Error {
  constructor() {
    super("An invoice is available only after payment is successfully captured.");
    this.name = "InvoiceNotReadyError";
  }
}

type PaidOrder = {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  currency: string;
  subtotalPaise: number;
  shippingPaise: number;
  totalPaise: number;
  razorpayOrderId: string | null;
  razorpayPaymentId: string | null;
  shippingName: string;
  shippingPhone: string;
  shippingAddress1: string;
  shippingAddress2: string | null;
  shippingCity: string;
  shippingState: string;
  shippingPostalCode: string;
  user: { email: string; displayName: string | null };
  items: Array<{
    productName: string;
    quantity: number;
    unitPricePaise: number;
    lineTotalPaise: number;
  }>;
};

function envValue(name: string) {
  return process.env[name]?.trim() || "";
}

export async function ensureInvoiceForPaidOrder(orderId: string): Promise<Invoice> {
  const existing = await db.invoice.findUnique({ where: { orderId } });
  if (existing) return existing;

  const order = await db.order.findUnique({
    where: { id: orderId },
    include: { user: { select: { email: true, displayName: true } }, items: true },
  }) as PaidOrder | null;

  if (
    !order ||
    order.paymentStatus !== "CAPTURED" ||
    !["PAID", "PROCESSING", "SHIPPED", "DELIVERED"].includes(order.status)
  ) {
    throw new InvoiceNotReadyError();
  }

  const sellerLegalName = envValue("INVOICE_SELLER_LEGAL_NAME");
  const sellerAddress = envValue("INVOICE_SELLER_ADDRESS").replace(/\\n/g, "\n");
  if (!sellerLegalName || !sellerAddress) throw new InvoiceConfigurationError();

  const prefix = envValue("INVOICE_NUMBER_PREFIX") || "VOO-INV";
  // Deterministic per-order number makes retries idempotent. This is not a sequential GST invoice series.
  const invoiceNumber = `${prefix}-${order.orderNumber}`;
  const buyerEmail = order.user.email.endsWith(".users.vooye.invalid") ? null : order.user.email;
  const shippingAddress = [
    order.shippingAddress1,
    order.shippingAddress2,
    `${order.shippingCity}, ${order.shippingState} ${order.shippingPostalCode}`,
    "India",
  ].filter(Boolean).join("\n");

  return db.invoice.upsert({
    where: { orderId: order.id },
    create: {
      invoiceNumber,
      orderId: order.id,
      sellerLegalName,
      sellerAddress,
      sellerGstin: envValue("INVOICE_SELLER_GSTIN") || null,
      sellerEmail: envValue("INVOICE_SELLER_EMAIL") || null,
      sellerPhone: envValue("INVOICE_SELLER_PHONE") || null,
      buyerName: order.shippingName || order.user.displayName || "Customer",
      buyerEmail,
      buyerPhone: order.shippingPhone,
      shippingAddress,
      currency: order.currency,
      subtotalPaise: order.subtotalPaise,
      shippingPaise: order.shippingPaise,
      // Checkout currently has no tax calculation/line item; do not invent tax amounts.
      taxPaise: 0,
      totalPaise: order.totalPaise,
      razorpayOrderId: order.razorpayOrderId,
      razorpayPaymentId: order.razorpayPaymentId,
    },
    update: {},
  });
}

type InvoicePdfOrder = Pick<PaidOrder, "orderNumber" | "razorpayOrderId" | "razorpayPaymentId" | "items">;

function ascii(value: string) {
  return value.normalize("NFKD").split("").map((character) => { const code = character.charCodeAt(0); return code >= 32 && code <= 126 ? character : "?"; }).join("");
}

function wrap(value: string, width = 88): string[] {
  const normalized = ascii(value).replace(/\s+/g, " ").trim();
  if (!normalized) return [""];
  const words = normalized.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if (line && (line + " " + word).length > width) {
      lines.push(line);
      line = word;
    } else {
      line = line ? line + " " + word : word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function formatInr(paise: number) {
  return `INR ${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function escapePdf(value: string) {
  let result = "";
  for (const character of ascii(value)) {
    if (character === "\\") result += "\\\\";
    else if (character === "(" || character === ")") result += "\\" + character;
    else result += character;
  }
  return result;
}

function makePdf(pages: string[][]): Buffer {
  const objects: string[] = [];
  const pageIds = pages.map((_, index) => 3 + index * 2);
  const fontId = 3 + pages.length * 2;

  objects[0] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`;

  pages.forEach((lines, index) => {
    const pageId = pageIds[index];
    const streamId = pageId + 1;
    objects[pageId - 1] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${streamId} 0 R >>`;

    let stream = "BT\n/F1 10 Tf\n52 790 Td\n14 TL\n";
    lines.forEach((line, lineIndex) => {
      stream += `(${escapePdf(line)}) Tj\n`;
      if (lineIndex < lines.length - 1) stream += "T*\n";
    });
    stream += "ET";

    objects[streamId - 1] = `<< /Length ${Buffer.byteLength(stream, "ascii")} >>\nstream\n${stream}\nendstream`;
  });

  objects[fontId - 1] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";

  let pdf = "%PDF-1.4\n%VOOYE\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf, "ascii"));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf, "ascii");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, "ascii");
}

export function buildInvoicePdf(invoice: Invoice, order: InvoicePdfOrder): Buffer {
  const lines: string[] = [
    "VOOYE - INVOICE / PAYMENT RECORD",
    "",
    `Invoice number: ${invoice.invoiceNumber}`,
    `Invoice date: ${invoice.issuedAt.toISOString().slice(0, 10)}`,
    `Order number: ${order.orderNumber}`,
    `Payment status: CAPTURED`,
    `Razorpay order reference: ${invoice.razorpayOrderId || "Not available"}`,
    `Razorpay payment reference: ${invoice.razorpayPaymentId || "Not available"}`,
    "",
    "SELLER",
    invoice.sellerLegalName,
    ...invoice.sellerAddress.split("\n"),
    ...(invoice.sellerEmail ? [`Email: ${invoice.sellerEmail}`] : []),
    ...(invoice.sellerPhone ? [`Phone: ${invoice.sellerPhone}`] : []),
    ...(invoice.sellerGstin ? [`GSTIN provided: ${invoice.sellerGstin}`] : []),
    "",
    "BILL TO",
    invoice.buyerName,
    ...(invoice.buyerEmail ? [`Email: ${invoice.buyerEmail}`] : []),
    `Phone: ${invoice.buyerPhone}`,
    "DELIVERY ADDRESS",
    ...invoice.shippingAddress.split("\n"),
    "",
    "ITEMS",
    "Description | Qty | Unit price | Line total",
    ...order.items.flatMap((item) => wrap(`${item.productName} | ${item.quantity} | ${formatInr(item.unitPricePaise)} | ${formatInr(item.lineTotalPaise)}`)),
    "",
    `Subtotal: ${formatInr(invoice.subtotalPaise)}`,
    `Shipping: ${formatInr(invoice.shippingPaise)}`,
    "GST / taxes: Not calculated separately by current checkout",
    `TOTAL PAID: ${formatInr(invoice.totalPaise)}`,
    "",
    "IMPORTANT TAX NOTE",
    "This document records the order and captured payment. Checkout has not",
    "calculated GST separately, and the invoice number is order-derived rather",
    "than a sequential GST invoice series. Do not use this as a GST tax invoice",
    "until your tax treatment, registration details and numbering are configured.",
  ].flatMap((line) => wrap(line));

  const pages: string[][] = [];
  for (let index = 0; index < lines.length; index += 48) {
    const slice = lines.slice(index, index + 48);
    pages.push(index === 0 ? slice : [`VOOYE INVOICE (continued) - ${invoice.invoiceNumber}`, "", ...slice.slice(0, 46)]);
  }
  return makePdf(pages.length ? pages : [["VOOYE INVOICE"]]);
}

/** Invoice errors must not turn a confirmed payment into a failed checkout response. */
export async function tryIssueInvoiceForPaidOrder(orderId: string): Promise<boolean> {
  try {
    await ensureInvoiceForPaidOrder(orderId);
    return true;
  } catch (cause) {
    console.error("Invoice issuance deferred", {
      orderId,
      reason: cause instanceof Error ? cause.message : "Unknown error",
    });
    return false;
  }
}
