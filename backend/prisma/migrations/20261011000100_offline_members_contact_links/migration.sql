ALTER TABLE "contacts" ADD COLUMN "linkedUserId" UUID;
CREATE UNIQUE INDEX "contacts_userId_linkedUserId_key" ON "contacts"("userId", "linkedUserId");
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_linkedUserId_fkey" FOREIGN KEY ("linkedUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "split_members" ALTER COLUMN "userId" DROP NOT NULL;
ALTER TABLE "split_members" ADD COLUMN "contactId" UUID;
ALTER TABLE "split_members" ADD COLUMN "offlineName" VARCHAR(100);
ALTER TABLE "split_members" ADD CONSTRAINT "split_members_identity_check" CHECK ("userId" IS NOT NULL OR ("contactId" IS NOT NULL AND "offlineName" IS NOT NULL));
CREATE UNIQUE INDEX "split_members_groupId_contactId_key" ON "split_members"("groupId", "contactId");
ALTER TABLE "split_members" ADD CONSTRAINT "split_members_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "contact_link_requests" (
  "id" UUID NOT NULL PRIMARY KEY,
  "contactId" UUID NOT NULL UNIQUE,
  "recipientId" UUID NOT NULL,
  "status" VARCHAR(12) NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "respondedAt" TIMESTAMP(3),
  CONSTRAINT "contact_link_requests_status_check" CHECK ("status" IN ('PENDING','ACCEPTED','DECLINED')),
  CONSTRAINT "contact_link_requests_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "contact_link_requests_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "contact_link_requests_recipientId_status_idx" ON "contact_link_requests"("recipientId", "status");

CREATE TABLE "contact_money_shares" (
  "entryId" UUID NOT NULL PRIMARY KEY,
  "recipientId" UUID NOT NULL,
  "sharedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "contact_money_shares_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "contact_money_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "contact_money_shares_recipientId_idx" ON "contact_money_shares"("recipientId");
