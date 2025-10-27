-- Ensure viewing quota columns exist for playback usage tracking
ALTER TABLE "Quota"
ADD COLUMN IF NOT EXISTS "viewingUsedBytes" BIGINT NOT NULL DEFAULT 0;

ALTER TABLE "Quota"
ADD COLUMN IF NOT EXISTS "viewingLimitBytes" BIGINT;

ALTER TABLE "Quota"
ADD COLUMN IF NOT EXISTS "viewingResetAt" TIMESTAMP(3);

-- Backfill data for existing quotas so constraints can be applied safely
UPDATE "Quota"
SET "viewingLimitBytes" = "streamingLimitBytes"
WHERE "viewingLimitBytes" IS NULL;

UPDATE "Quota"
SET "viewingResetAt" = "streamingResetAt"
WHERE "viewingResetAt" IS NULL;

-- Enforce required constraints after data is populated
ALTER TABLE "Quota"
ALTER COLUMN "viewingLimitBytes" SET NOT NULL;

ALTER TABLE "Quota"
ALTER COLUMN "viewingResetAt" SET NOT NULL;
