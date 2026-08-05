CREATE TABLE "ResumeAsset" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'me',
    "source" TEXT NOT NULL,
    "fileName" TEXT NOT NULL DEFAULT 'resume.pdf',
    "mimeType" TEXT NOT NULL DEFAULT 'application/pdf',
    "data" BLOB NOT NULL,
    "size" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);
