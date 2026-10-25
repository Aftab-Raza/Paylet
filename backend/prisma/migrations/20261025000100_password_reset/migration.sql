BEGIN;
ALTER TABLE "users" ADD COLUMN "authVersion" INTEGER NOT NULL DEFAULT 0;
CREATE TABLE "password_reset_tokens" (
  "tokenHash" VARCHAR(64) NOT NULL PRIMARY KEY,
  "userId" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "password_reset_tokens_userId_idx" ON "password_reset_tokens"("userId");
CREATE INDEX "password_reset_tokens_expiresAt_idx" ON "password_reset_tokens"("expiresAt");
COMMIT;
