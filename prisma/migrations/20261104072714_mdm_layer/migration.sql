-- CreateTable
CREATE TABLE "MdmRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entityType" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT,
    "isActive" BOOLEAN NOT NULL,
    "mdmVersion" INTEGER NOT NULL,
    "payload" TEXT NOT NULL,
    "syncedAt" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "MdmSyncState" (
    "entityType" TEXT NOT NULL PRIMARY KEY,
    "appliedVersion" INTEGER NOT NULL DEFAULT 0,
    "lastSyncAt" TEXT,
    "lastError" TEXT
);

-- CreateTable
CREATE TABLE "MdmSyncRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "startedAt" TEXT NOT NULL,
    "finishedAt" TEXT,
    "mode" TEXT NOT NULL,
    "fromVersion" INTEGER NOT NULL,
    "toVersion" INTEGER,
    "applied" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "actorId" TEXT NOT NULL
);

-- CreateIndex
CREATE INDEX "MdmRecord_entityType_idx" ON "MdmRecord"("entityType");

-- CreateIndex
CREATE UNIQUE INDEX "MdmRecord_entityType_code_key" ON "MdmRecord"("entityType", "code");
