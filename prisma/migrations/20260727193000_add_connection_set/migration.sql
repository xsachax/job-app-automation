-- CreateTable
CREATE TABLE "ConnectionSet" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'me',
    "data" TEXT NOT NULL DEFAULT '{}',
    "updatedAt" DATETIME NOT NULL
);
