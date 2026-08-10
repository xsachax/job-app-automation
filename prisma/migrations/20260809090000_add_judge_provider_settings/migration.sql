-- CreateTable
CREATE TABLE "JudgeProviderSettings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "provider" TEXT NOT NULL DEFAULT 'openai',
    "openAiModel" TEXT,
    "openAiApiKey" TEXT,
    "anthropicModel" TEXT,
    "anthropicApiKey" TEXT,
    "updatedAt" DATETIME NOT NULL
);
