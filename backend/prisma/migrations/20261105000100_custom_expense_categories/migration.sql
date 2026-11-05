CREATE TABLE "expense_categories" (
  "userId" UUID NOT NULL,
  "name" VARCHAR(40) NOT NULL,
  "normalizedName" VARCHAR(100) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "expense_categories_pkey" PRIMARY KEY ("userId", "normalizedName"),
  CONSTRAINT "expense_categories_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
