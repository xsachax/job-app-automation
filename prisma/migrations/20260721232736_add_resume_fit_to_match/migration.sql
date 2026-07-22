-- AlterTable
ALTER TABLE "Match" ADD COLUMN "matchProvider" TEXT;
ALTER TABLE "Match" ADD COLUMN "resumeReasons" TEXT;
ALTER TABLE "Match" ADD COLUMN "resumeScore" INTEGER;
ALTER TABLE "Match" ADD COLUMN "resumeScoredAt" DATETIME;
ALTER TABLE "Match" ADD COLUMN "resumeSummary" TEXT;
ALTER TABLE "Match" ADD COLUMN "scoredResumeVersion" TEXT;
