CREATE TABLE "split_groups" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "split_groups_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "split_members" (
    "id" UUID NOT NULL,
    "groupId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "split_members_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "split_invitations" (
    "id" UUID NOT NULL,
    "groupId" UUID NOT NULL,
    "recipientId" UUID NOT NULL,
    "status" VARCHAR(12) NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),
    CONSTRAINT "split_invitations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "split_invitations_status_check"
        CHECK ("status" IN ('PENDING', 'ACCEPTED', 'DECLINED'))
);

CREATE INDEX "split_groups_ownerId_createdAt_idx"
    ON "split_groups"("ownerId", "createdAt");

CREATE UNIQUE INDEX "split_members_groupId_userId_key"
    ON "split_members"("groupId", "userId");

CREATE INDEX "split_members_userId_idx"
    ON "split_members"("userId");

CREATE UNIQUE INDEX "split_invitations_groupId_recipientId_key"
    ON "split_invitations"("groupId", "recipientId");

CREATE INDEX "split_invitations_recipientId_status_idx"
    ON "split_invitations"("recipientId", "status");

ALTER TABLE "split_groups"
    ADD CONSTRAINT "split_groups_ownerId_fkey"
    FOREIGN KEY ("ownerId") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "split_members"
    ADD CONSTRAINT "split_members_groupId_fkey"
    FOREIGN KEY ("groupId") REFERENCES "split_groups"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "split_members"
    ADD CONSTRAINT "split_members_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "split_invitations"
    ADD CONSTRAINT "split_invitations_groupId_fkey"
    FOREIGN KEY ("groupId") REFERENCES "split_groups"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "split_invitations"
    ADD CONSTRAINT "split_invitations_recipientId_fkey"
    FOREIGN KEY ("recipientId") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;