CREATE TABLE "loans" (
    "id" UUID NOT NULL,
    "contactId" UUID NOT NULL,
    "direction" VARCHAR(10) NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "minorUnit" INTEGER NOT NULL,
    "purpose" VARCHAR(200) NOT NULL,
    "loanDate" DATE NOT NULL,
    "dueDate" DATE,
    "version" INTEGER NOT NULL DEFAULT 1,
    "voidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "loans_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "loans_amount_positive" CHECK ("amountMinor" > 0),
    CONSTRAINT "loans_direction_valid"
        CHECK ("direction" IN ('LENT', 'BORROWED')),
    CONSTRAINT "loans_minor_unit_valid"
        CHECK ("minorUnit" BETWEEN 0 AND 4),
    CONSTRAINT "loans_version_positive" CHECK ("version" > 0),
    CONSTRAINT "loans_due_date_valid"
        CHECK ("dueDate" IS NULL OR "dueDate" >= "loanDate")
);

CREATE TABLE "loan_repayments" (
    "id" UUID NOT NULL,
    "loanId" UUID NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "paidOn" DATE NOT NULL,
    "note" VARCHAR(300),
    "voidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "loan_repayments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "loan_repayments_amount_positive"
        CHECK ("amountMinor" > 0)
);

CREATE TABLE "loan_history" (
    "id" UUID NOT NULL,
    "loanId" UUID NOT NULL,
    "action" VARCHAR(30) NOT NULL,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loan_history_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "loans_contactId_loanDate_idx"
ON "loans"("contactId", "loanDate");

CREATE INDEX "loan_repayments_loanId_paidOn_idx"
ON "loan_repayments"("loanId", "paidOn");

CREATE INDEX "loan_history_loanId_createdAt_idx"
ON "loan_history"("loanId", "createdAt");

ALTER TABLE "loans"
ADD CONSTRAINT "loans_contactId_fkey"
FOREIGN KEY ("contactId") REFERENCES "contacts"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "loan_repayments"
ADD CONSTRAINT "loan_repayments_loanId_fkey"
FOREIGN KEY ("loanId") REFERENCES "loans"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "loan_history"
ADD CONSTRAINT "loan_history_loanId_fkey"
FOREIGN KEY ("loanId") REFERENCES "loans"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;