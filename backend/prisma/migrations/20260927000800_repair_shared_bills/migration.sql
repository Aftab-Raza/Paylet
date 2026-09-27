-- Forward repair: preserve migration history and all existing application data.
-- On a fresh database, the preceding migration already creates these tables.
BEGIN;
SET LOCAL search_path TO public;
DO $repair$
BEGIN
  IF to_regclass('public.shared_bills') IS NULL
     AND to_regclass('public.shared_bill_shares') IS NULL
     AND to_regclass('public.shared_bill_history') IS NULL THEN
CREATE TABLE "shared_bills" (
 "id" UUID PRIMARY KEY, "groupId" UUID NOT NULL, "creatorId" UUID NOT NULL, "payerId" UUID NOT NULL,
 "amountMinor" BIGINT NOT NULL CHECK ("amountMinor" > 0), "currency" VARCHAR(3) NOT NULL,
 "minorUnit" INTEGER NOT NULL CHECK ("minorUnit" BETWEEN 0 AND 4), "purpose" VARCHAR(200) NOT NULL,
 "category" VARCHAR(40) NOT NULL, "spentOn" DATE NOT NULL,
 "splitMode" VARCHAR(10) NOT NULL CHECK ("splitMode" IN ('EQUAL', 'CUSTOM')),
 "deletedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "shared_bills_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "split_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "shared_bills_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "shared_bills_payerId_fkey" FOREIGN KEY ("payerId") REFERENCES "split_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "shared_bills_groupId_spentOn_idx" ON "shared_bills"("groupId", "spentOn");
CREATE TABLE "shared_bill_shares" (
 "id" UUID PRIMARY KEY, "billId" UUID NOT NULL, "memberId" UUID NOT NULL,
 "amountMinor" BIGINT NOT NULL CHECK ("amountMinor" >= 0),
 CONSTRAINT "shared_bill_shares_billId_fkey" FOREIGN KEY ("billId") REFERENCES "shared_bills"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "shared_bill_shares_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "split_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "shared_bill_shares_billId_memberId_key" ON "shared_bill_shares"("billId", "memberId");
CREATE INDEX "shared_bill_shares_memberId_idx" ON "shared_bill_shares"("memberId");
CREATE TABLE "shared_bill_history" (
 "id" UUID PRIMARY KEY, "billId" UUID NOT NULL, "actorId" UUID NOT NULL,
 "action" VARCHAR(12) NOT NULL CHECK ("action" IN ('CREATED', 'DELETED')),
 "snapshot" JSONB NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "shared_bill_history_billId_fkey" FOREIGN KEY ("billId") REFERENCES "shared_bills"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "shared_bill_history_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "shared_bill_history_billId_createdAt_idx" ON "shared_bill_history"("billId", "createdAt");

  ELSIF to_regclass('public.shared_bills') IS NULL
     OR to_regclass('public.shared_bill_shares') IS NULL
     OR to_regclass('public.shared_bill_history') IS NULL THEN
    RAISE EXCEPTION 'Partial shared-bill schema detected. No changes applied; inspect the existing tables before repair.';
  END IF;
END;
$repair$;
COMMIT;
