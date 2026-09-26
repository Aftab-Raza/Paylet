CREATE TABLE "expenses" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "minorUnit" INTEGER NOT NULL,
    "purpose" VARCHAR(200) NOT NULL,
    "category" VARCHAR(40) NOT NULL,
    "spentOn" DATE NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "voidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "expenses_amount_positive" CHECK ("amountMinor" > 0),
    CONSTRAINT "expenses_minor_unit_valid" CHECK ("minorUnit" BETWEEN 0 AND 4),
    CONSTRAINT "expenses_version_positive" CHECK ("version" > 0)
);

CREATE TABLE "expense_revisions" (
    "id" UUID NOT NULL,
    "expenseId" UUID NOT NULL,
    "action" VARCHAR(20) NOT NULL,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expense_revisions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "expenses_userId_spentOn_idx"
ON "expenses"("userId", "spentOn");

CREATE INDEX "expense_revisions_expenseId_createdAt_idx"
ON "expense_revisions"("expenseId", "createdAt");

ALTER TABLE "expenses"
ADD CONSTRAINT "expenses_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "expense_revisions"
ADD CONSTRAINT "expense_revisions_expenseId_fkey"
FOREIGN KEY ("expenseId") REFERENCES "expenses"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;