-- AlterTable
ALTER TABLE "Job" ADD COLUMN "fingerprint" TEXT;

-- CreateTable
CREATE TABLE "ResumeVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "source" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "parsed" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
