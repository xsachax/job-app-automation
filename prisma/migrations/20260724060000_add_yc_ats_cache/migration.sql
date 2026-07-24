-- CreateTable
CREATE TABLE "YcAtsCache" (
    "slug" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "website" TEXT,
    "batch" TEXT,
    "system" TEXT,
    "token" TEXT,
    "checkedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
