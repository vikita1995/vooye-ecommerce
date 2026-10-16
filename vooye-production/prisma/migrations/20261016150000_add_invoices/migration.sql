-- Persistent invoice snapshot for completed Razorpay payments.
-- No tax is inferred here: checkout currently does not calculate GST separately.
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sellerLegalName" TEXT NOT NULL,
    "sellerAddress" TEXT NOT NULL,
    "sellerGstin" TEXT,
    "sellerEmail" TEXT,
    "sellerPhone" TEXT,
    "buyerName" TEXT NOT NULL,
    "buyerEmail" TEXT,
    "buyerPhone" TEXT NOT NULL,
    "shippingAddress" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "subtotalPaise" INTEGER NOT NULL,
    "shippingPaise" INTEGER NOT NULL,
    "taxPaise" INTEGER NOT NULL DEFAULT 0,
    "totalPaise" INTEGER NOT NULL,
    "razorpayOrderId" TEXT,
    "razorpayPaymentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Invoice_invoiceNumber_key" ON "Invoice"("invoiceNumber");
CREATE UNIQUE INDEX "Invoice_orderId_key" ON "Invoice"("orderId");
CREATE INDEX "Invoice_issuedAt_idx" ON "Invoice"("issuedAt");

ALTER TABLE "Invoice"
ADD COLUMN "emailSentAt" TIMESTAMP(3),
ADD COLUMN "emailProviderId" TEXT;

ALTER TABLE "Invoice"
ADD CONSTRAINT "Invoice_orderId_fkey"
FOREIGN KEY ("orderId") REFERENCES "Order"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
