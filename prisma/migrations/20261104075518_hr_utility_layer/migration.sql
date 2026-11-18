-- CreateTable
CREATE TABLE "HrResolution" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "askedAt" TEXT NOT NULL,
    "at" TEXT NOT NULL,
    "officeCode" TEXT NOT NULL,
    "postCode" TEXT NOT NULL,
    "functionCode" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "employeeId" TEXT,
    "employeeName" TEXT,
    "capacity" TEXT,
    "chairId" TEXT,
    "reason" TEXT,
    "mdmVersion" INTEGER,
    "response" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "applicationId" TEXT
);

-- CreateTable
CREATE TABLE "HrEvent" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "type" TEXT NOT NULL,
    "ts" TEXT NOT NULL,
    "effectiveAt" TEXT NOT NULL,
    "employeeId" TEXT,
    "officeCode" TEXT,
    "postCode" TEXT,
    "isDemo" BOOLEAN NOT NULL,
    "payload" TEXT NOT NULL,
    "receivedAt" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "HrEventCursor" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "lastId" INTEGER NOT NULL DEFAULT 0,
    "polledAt" TEXT,
    "lastError" TEXT
);

-- CreateIndex
CREATE INDEX "HrResolution_officeCode_postCode_at_idx" ON "HrResolution"("officeCode", "postCode", "at");
