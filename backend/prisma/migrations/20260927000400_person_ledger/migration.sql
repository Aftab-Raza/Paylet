CREATE TABLE "contact_money_entries" (
    "id" UUID NOT NULL,
    "contactId" UUID NOT NULL,
    "direction" VARCHAR(10) NOT NULL,
    "kind" VARCHAR(10) NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "minorUnit" INTEGER NOT NULL,
    "purpose" VARCHAR(300) NOT NULL,
    "entryDate" DATE NOT NULL,
    "voidedAt" TIMESTAMP(3),
    "legacyLoanId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contact_money_entries_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "contact_money_entries_amount_positive"
        CHECK ("amountMinor" > 0),
    CONSTRAINT "contact_money_entries_direction_valid"
        CHECK ("direction" IN ('LENT', 'BORROWED')),
    CONSTRAINT "contact_money_entries_kind_valid"
        CHECK ("kind" IN ('ADVANCE', 'REPAYMENT')),
    CONSTRAINT "contact_money_entries_minor_unit_valid"
        CHECK ("minorUnit" BETWEEN 0 AND 4)
);

CREATE TABLE "contact_money_history" (
    "id" UUID NOT NULL,
    "entryId" UUID NOT NULL,
    "action" VARCHAR(30) NOT NULL,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_money_history_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "contact_money_entries_contactId_entryDate_idx"
ON "contact_money_entries"("contactId", "entryDate");

CREATE INDEX "contact_money_history_entryId_createdAt_idx"
ON "contact_money_history"("entryId", "createdAt");

ALTER TABLE "contact_money_entries"
ADD CONSTRAINT "contact_money_entries_contactId_fkey"
FOREIGN KEY ("contactId") REFERENCES "contacts"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "contact_money_history"
ADD CONSTRAINT "contact_money_history_entryId_fkey"
FOREIGN KEY ("entryId") REFERENCES "contact_money_entries"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- Copy existing loan amounts into person-level entries.
INSERT INTO "contact_money_entries" (
    "id",
    "contactId",
    "direction",
    "kind",
    "amountMinor",
    "currency",
    "minorUnit",
    "purpose",
    "entryDate",
    "voidedAt",
    "legacyLoanId",
    "createdAt",
    "updatedAt"
)
SELECT
    "id",
    "contactId",
    "direction",
    'ADVANCE',
    "amountMinor",
    "currency",
    "minorUnit",
    "purpose",
    "loanDate",
    "voidedAt",
    "id",
    "createdAt",
    "updatedAt"
FROM "loans";

-- Copy repayments as independent entries against the person.
INSERT INTO "contact_money_entries" (
    "id",
    "contactId",
    "direction",
    "kind",
    "amountMinor",
    "currency",
    "minorUnit",
    "purpose",
    "entryDate",
    "voidedAt",
    "legacyLoanId",
    "createdAt",
    "updatedAt"
)
SELECT
    r."id",
    l."contactId",
    l."direction",
    'REPAYMENT',
    r."amountMinor",
    l."currency",
    l."minorUnit",
    COALESCE(NULLIF(r."note", ''), 'Repayment'),
    r."paidOn",
    COALESCE(r."voidedAt", l."voidedAt"),
    l."id",
    r."createdAt",
    r."updatedAt"
FROM "loan_repayments" r
JOIN "loans" l ON l."id" = r."loanId";