-- AlterTable
ALTER TABLE "Job" ADD COLUMN "availabilityStatus" TEXT NOT NULL DEFAULT 'open';
ALTER TABLE "Job" ADD COLUMN "consecutiveMisses" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Job" ADD COLUMN "lastVerifiedAt" DATETIME;
ALTER TABLE "Job" ADD COLUMN "lastVerificationResult" TEXT;
ALTER TABLE "Job" ADD COLUMN "closedAt" DATETIME;
ALTER TABLE "Job" ADD COLUMN "closureReason" TEXT;

-- CreateTable
CREATE TABLE "DiscoverySource" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "system" TEXT NOT NULL,
    "company" TEXT,
    "authoritative" BOOLEAN NOT NULL DEFAULT false,
    "positiveEvidence" TEXT NOT NULL DEFAULT 'direct',
    "expectedComplete" BOOLEAN NOT NULL DEFAULT false,
    "baselineAt" DATETIME,
    "lastRunAt" DATETIME,
    "lastCompleteRunAt" DATETIME,
    "lastStatus" TEXT,
    "lastMessage" TEXT,
    "lastObservedCount" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "DiscoverySourceRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceKey" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'running',
    "complete" BOOLEAN NOT NULL DEFAULT false,
    "seeded" BOOLEAN NOT NULL DEFAULT false,
    "observedCount" INTEGER NOT NULL DEFAULT 0,
    "message" TEXT,
    CONSTRAINT "DiscoverySourceRun_sourceKey_fkey" FOREIGN KEY ("sourceKey") REFERENCES "DiscoverySource" ("key") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DiscoveryJobSighting" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "firstSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenRunId" TEXT NOT NULL,
    "consecutiveMisses" INTEGER NOT NULL DEFAULT 0,
    "lastMissingAt" DATETIME,
    "lastVerifiedAt" DATETIME,
    "lastVerificationStatus" TEXT,
    CONSTRAINT "DiscoveryJobSighting_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DiscoveryJobSighting_sourceKey_fkey" FOREIGN KEY ("sourceKey") REFERENCES "DiscoverySource" ("key") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Job_availabilityStatus_idx" ON "Job"("availabilityStatus");

-- CreateIndex
CREATE INDEX "DiscoverySource_system_idx" ON "DiscoverySource"("system");

-- CreateIndex
CREATE INDEX "DiscoverySource_company_idx" ON "DiscoverySource"("company");

-- CreateIndex
CREATE INDEX "DiscoverySourceRun_sourceKey_startedAt_idx" ON "DiscoverySourceRun"("sourceKey", "startedAt");

-- CreateIndex
CREATE INDEX "DiscoverySourceRun_status_complete_idx" ON "DiscoverySourceRun"("status", "complete");

-- CreateIndex
CREATE UNIQUE INDEX "DiscoveryJobSighting_jobId_sourceKey_key" ON "DiscoveryJobSighting"("jobId", "sourceKey");

-- CreateIndex
CREATE INDEX "DiscoveryJobSighting_sourceKey_lastSeenRunId_idx" ON "DiscoveryJobSighting"("sourceKey", "lastSeenRunId");

-- CreateIndex
CREATE INDEX "DiscoveryJobSighting_jobId_consecutiveMisses_idx" ON "DiscoveryJobSighting"("jobId", "consecutiveMisses");
