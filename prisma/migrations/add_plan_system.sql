-- CreateEnum
CREATE TYPE "Plan" AS ENUM ('free', 'basic', 'standard', 'premium');

-- AlterTable
ALTER TABLE "User" ADD COLUMN "plan" TEXT NOT NULL DEFAULT 'free';
ALTER TABLE "User" ADD COLUMN "planPrice" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "storageLimit" BIGINT NOT NULL DEFAULT 1073741824;

-- CreateIndex
CREATE INDEX "User_plan_idx" ON "User"("plan");

-- CreateIndex  
CREATE INDEX "SystemLog_level_idx" ON "SystemLog"("level");
