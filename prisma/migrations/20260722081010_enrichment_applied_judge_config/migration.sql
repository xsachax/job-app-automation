-- CreateTable
CREATE TABLE "DiscoveryConfig" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "data" TEXT NOT NULL DEFAULT '{}',
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Job" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dedupeKey" TEXT NOT NULL,
    "atsType" TEXT NOT NULL DEFAULT 'unknown',
    "externalId" TEXT,
    "title" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "location" TEXT,
    "remote" BOOLEAN NOT NULL DEFAULT false,
    "applyUrl" TEXT NOT NULL,
    "description" TEXT,
    "postedAt" DATETIME,
    "isWorkday" BOOLEAN NOT NULL DEFAULT false,
    "country" TEXT,
    "isEntryLevel" BOOLEAN NOT NULL DEFAULT false,
    "minYoE" INTEGER,
    "discoverySystem" TEXT,
    "fingerprint" TEXT,
    "salaryMin" INTEGER,
    "salaryMax" INTEGER,
    "salaryCurrency" TEXT,
    "salaryRaw" TEXT,
    "sponsorship" TEXT,
    "skills" TEXT,
    "employmentType" TEXT,
    "applicationStatus" TEXT NOT NULL DEFAULT 'none',
    "appliedAt" DATETIME,
    "fitScore" INTEGER,
    "fitReasons" TEXT,
    "fitSummary" TEXT,
    "fitProvider" TEXT,
    "fitScoredAt" DATETIME,
    "firstSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw" TEXT
);
INSERT INTO "new_Job" ("applyUrl", "atsType", "company", "country", "dedupeKey", "description", "discoverySystem", "externalId", "fingerprint", "firstSeenAt", "id", "isEntryLevel", "isWorkday", "lastSeenAt", "location", "minYoE", "postedAt", "raw", "remote", "title") SELECT "applyUrl", "atsType", "company", "country", "dedupeKey", "description", "discoverySystem", "externalId", "fingerprint", "firstSeenAt", "id", "isEntryLevel", "isWorkday", "lastSeenAt", "location", "minYoE", "postedAt", "raw", "remote", "title" FROM "Job";
DROP TABLE "Job";
ALTER TABLE "new_Job" RENAME TO "Job";
CREATE UNIQUE INDEX "Job_dedupeKey_key" ON "Job"("dedupeKey");
CREATE INDEX "Job_isWorkday_idx" ON "Job"("isWorkday");
CREATE INDEX "Job_company_idx" ON "Job"("company");
CREATE INDEX "Job_country_idx" ON "Job"("country");
CREATE INDEX "Job_isEntryLevel_idx" ON "Job"("isEntryLevel");
CREATE INDEX "Job_fingerprint_idx" ON "Job"("fingerprint");
CREATE INDEX "Job_applicationStatus_idx" ON "Job"("applicationStatus");
CREATE INDEX "Job_fitScore_idx" ON "Job"("fitScore");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
