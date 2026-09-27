BEGIN;
SET LOCAL search_path TO public;
CREATE TABLE "group_settlements" (
 "id" UUID PRIMARY KEY, "groupId" UUID NOT NULL, "creatorId" UUID NOT NULL,
 "fromMemberId" UUID NOT NULL, "toMemberId" UUID NOT NULL,
 "amountMinor" BIGINT NOT NULL CHECK ("amountMinor" > 0),
 "currency" VARCHAR(3) NOT NULL, "minorUnit" INTEGER NOT NULL CHECK ("minorUnit" BETWEEN 0 AND 4),
 "paidOn" DATE NOT NULL, "note" VARCHAR(300) NOT NULL,
 "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING'
 CHECK ("status" IN ('PENDING','CONFIRMED','REJECTED','CANCELLED','REVERSAL_PENDING','REVERSED')),
 "version" INTEGER NOT NULL DEFAULT 1, "reversalRequesterId" UUID,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CHECK ("fromMemberId" <> "toMemberId"),
 CHECK ("reversalRequesterId" IS NULL OR "reversalRequesterId" IN ("fromMemberId", "toMemberId")),
 CHECK (("status" = 'REVERSAL_PENDING') = ("reversalRequesterId" IS NOT NULL)),
 CONSTRAINT "group_settlements_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "split_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "group_settlements_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "group_settlements_fromMemberId_fkey" FOREIGN KEY ("fromMemberId") REFERENCES "split_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "group_settlements_toMemberId_fkey" FOREIGN KEY ("toMemberId") REFERENCES "split_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "group_settlements_reversalRequesterId_fkey" FOREIGN KEY ("reversalRequesterId") REFERENCES "split_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "group_settlements_groupId_createdAt_idx" ON "group_settlements"("groupId", "createdAt");
CREATE TABLE "group_settlement_history" (
 "id" UUID PRIMARY KEY, "settlementId" UUID NOT NULL, "actorId" UUID NOT NULL,
 "action" VARCHAR(32) NOT NULL, "snapshot" JSONB NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "group_settlement_history_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "group_settlements"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "group_settlement_history_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "group_settlement_history_settlementId_createdAt_idx" ON "group_settlement_history"("settlementId", "createdAt");
COMMIT;
