CREATE TABLE "shared_payment_requests" (
  "entryId" UUID PRIMARY KEY REFERENCES "contact_money_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "recipientId" UUID NOT NULL,
  "status" VARCHAR(12) NOT NULL DEFAULT 'PENDING' CHECK ("status" IN ('PENDING','CONFIRMED','DECLINED')),
  "version" INTEGER NOT NULL DEFAULT 1,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "respondedAt" TIMESTAMP(3),
  "repaymentId" UUID REFERENCES "contact_money_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "shared_payment_requests_repaymentId_key" ON "shared_payment_requests"("repaymentId");
CREATE INDEX "shared_payment_requests_recipientId_status_idx" ON "shared_payment_requests"("recipientId", "status");
