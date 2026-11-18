-- CreateTable
CREATE TABLE "ExternalApplication" (
    "applicationId" TEXT NOT NULL PRIMARY KEY,
    "source" TEXT NOT NULL,
    "externalNo" TEXT NOT NULL,
    "importedAt" TEXT NOT NULL,
    "importedById" TEXT NOT NULL,
    "refreshedAt" TEXT,
    "status" TEXT NOT NULL,
    "appealGrounds" TEXT NOT NULL,
    "resolutionIds" TEXT NOT NULL,
    "ruleCode" TEXT,
    "ruleVersion" INTEGER,
    "mdmVersion" INTEGER,
    "snapshot" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "ExternalApplication_source_externalNo_key" ON "ExternalApplication"("source", "externalNo");
