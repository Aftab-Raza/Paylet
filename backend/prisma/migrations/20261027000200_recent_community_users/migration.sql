ALTER TABLE "users" ADD COLUMN "communityPhotoConsent" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN "lastLoginAt" TIMESTAMP(3);

-- Preserve the permission already given for community faces with a testimonial.
UPDATE "users" AS u SET "communityPhotoConsent" = true
FROM "testimonials" AS t WHERE t."userId" = u."id" AND t."photoConsent" = true;

CREATE INDEX "users_communityPhotoConsent_lastLoginAt_idx" ON "users"("communityPhotoConsent", "lastLoginAt");
