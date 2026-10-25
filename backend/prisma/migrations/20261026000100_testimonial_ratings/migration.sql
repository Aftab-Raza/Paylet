BEGIN;
ALTER TABLE "testimonials" ADD COLUMN "rating" INTEGER;
ALTER TABLE "testimonials" ADD CONSTRAINT "testimonials_rating_check"
CHECK ("rating" IS NULL OR "rating" BETWEEN 1 AND 5);
COMMIT;
