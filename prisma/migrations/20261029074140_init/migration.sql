-- CreateTable
CREATE TABLE "Department" (
    "code" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "District" (
    "code" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Office" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "districtCode" TEXT NOT NULL,
    "departmentCode" TEXT NOT NULL,
    "headOfOfficeId" TEXT,
    CONSTRAINT "Office_districtCode_fkey" FOREIGN KEY ("districtCode") REFERENCES "District" ("code") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Office_departmentCode_fkey" FOREIGN KEY ("departmentCode") REFERENCES "Department" ("code") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "designation" TEXT,
    "officeId" TEXT,
    "mobile" TEXT,
    "email" TEXT,
    "username" TEXT,
    "password" TEXT,
    "ddoId" TEXT,
    "hasDigitalAccess" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "User_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "Office" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Service" (
    "code" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "timeLimitWorkingDays" INTEGER NOT NULL,
    "documents" TEXT NOT NULL,
    "departmentCode" TEXT NOT NULL,
    CONSTRAINT "Service_departmentCode_fkey" FOREIGN KEY ("departmentCode") REFERENCES "Department" ("code") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuthorityMapping" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "serviceCode" TEXT NOT NULL,
    "officeId" TEXT NOT NULL,
    "dpsId" TEXT NOT NULL,
    "linkOfficerId" TEXT,
    "faaId" TEXT NOT NULL,
    "saaId" TEXT NOT NULL,
    "validFrom" TEXT NOT NULL,
    "validTo" TEXT,
    CONSTRAINT "AuthorityMapping_serviceCode_fkey" FOREIGN KEY ("serviceCode") REFERENCES "Service" ("code") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AuthorityMapping_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "Office" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Holiday" (
    "date" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "isSwitch" BOOLEAN NOT NULL DEFAULT false
);

-- CreateTable
CREATE TABLE "ClockState" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "today" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Counter" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" INTEGER NOT NULL
);

-- CreateTable
CREATE TABLE "Application" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "uin" TEXT,
    "serviceCode" TEXT NOT NULL,
    "citizenId" TEXT NOT NULL,
    "officeId" TEXT NOT NULL,
    "formData" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdOn" TEXT NOT NULL,
    "submittedOn" TEXT,
    "dueOn" TEXT,
    "pausedWorkingDays" INTEGER NOT NULL DEFAULT 0,
    "queryCount" INTEGER NOT NULL DEFAULT 0,
    "heldOn" TEXT,
    "flaggedToHoO" BOOLEAN NOT NULL DEFAULT false,
    "releasedOn" TEXT,
    "releaseReason" TEXT,
    "deliveredOn" TEXT,
    "deliveryRef" TEXT,
    "rejectedOn" TEXT,
    "rejectionReasons" TEXT,
    "closedOn" TEXT,
    "closeReason" TEXT,
    "confirmedOn" TEXT,
    "confirmedVia" TEXT,
    "dpsId" TEXT NOT NULL,
    "linkOfficerId" TEXT,
    "faaId" TEXT NOT NULL,
    "saaId" TEXT NOT NULL,
    "scenario" TEXT,
    CONSTRAINT "Application_serviceCode_fkey" FOREIGN KEY ("serviceCode") REFERENCES "Service" ("code") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Application_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "Office" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ApplicationDocument" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "applicationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    CONSTRAINT "ApplicationDocument_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InfoRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "applicationId" TEXT NOT NULL,
    "raisedById" TEXT NOT NULL,
    "raisedOn" TEXT NOT NULL,
    "items" TEXT NOT NULL,
    "secondRequestReason" TEXT,
    "respondedOn" TEXT,
    "response" TEXT,
    CONSTRAINT "InfoRequest_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Handover" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fromDpsId" TEXT NOT NULL,
    "toLinkOfficerId" TEXT NOT NULL,
    "officeId" TEXT NOT NULL,
    "startOn" TEXT NOT NULL,
    "endOn" TEXT NOT NULL,
    "recordedOn" TEXT NOT NULL,
    "recordedById" TEXT NOT NULL,
    "reason" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "LedgerEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "applicationId" TEXT NOT NULL,
    "officerId" TEXT NOT NULL,
    "capacity" TEXT NOT NULL,
    "fromOn" TEXT NOT NULL,
    "toOn" TEXT,
    "source" TEXT NOT NULL,
    CONSTRAINT "LedgerEntry_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Appeal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "appealNo" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "ground" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "parentAppealId" TEXT,
    "status" TEXT NOT NULL,
    "authorityId" TEXT,
    "draftCreatedOn" TEXT,
    "linkToken" TEXT,
    "linkExpiresOn" TEXT,
    "filedOn" TEXT,
    "filedById" TEXT,
    "groundsText" TEXT,
    "reliefSought" TEXT,
    "windowStartOn" TEXT,
    "windowEndsOn" TEXT,
    "isLate" BOOLEAN NOT NULL DEFAULT false,
    "lateReason" TEXT,
    "lateDecision" TEXT,
    "deadlineOn" TEXT,
    "extendedDeadlineOn" TEXT,
    "extensionReason" TEXT,
    "remandCycle" INTEGER NOT NULL DEFAULT 0,
    "remandDueOn" TEXT,
    "decidedOn" TEXT,
    "closedOn" TEXT,
    "reopenCount" INTEGER NOT NULL DEFAULT 0,
    "declinedOn" TEXT,
    "declineReason" TEXT,
    "scrutinyNote" TEXT,
    CONSTRAINT "Appeal_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MissedDeadline" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "appealId" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "authorityId" TEXT NOT NULL,
    "deadlineOn" TEXT NOT NULL,
    "detectedOn" TEXT NOT NULL,
    "escalatedToAppealId" TEXT,
    CONSTRAINT "MissedDeadline_appealId_fkey" FOREIGN KEY ("appealId") REFERENCES "Appeal" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RespondentReply" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "appealId" TEXT NOT NULL,
    "dpsId" TEXT NOT NULL,
    "requestedOn" TEXT NOT NULL,
    "dueOn" TEXT NOT NULL,
    "submittedOn" TEXT,
    "text" TEXT,
    CONSTRAINT "RespondentReply_appealId_fkey" FOREIGN KEY ("appealId") REFERENCES "Appeal" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Hearing" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "appealId" TEXT NOT NULL,
    "scheduledOn" TEXT NOT NULL,
    "timeSlot" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "inPersonReason" TEXT,
    "noticeServedOn" TEXT NOT NULL,
    "shortNoticeReason" TEXT,
    "videoLink" TEXT,
    "status" TEXT NOT NULL,
    "attendance" TEXT,
    "notes" TEXT,
    CONSTRAINT "Hearing_appealId_fkey" FOREIGN KEY ("appealId") REFERENCES "Appeal" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Bench" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "appealId" TEXT NOT NULL,
    "memberIds" TEXT NOT NULL,
    "presidingId" TEXT NOT NULL,
    "constitutedOn" TEXT NOT NULL,
    CONSTRAINT "Bench_appealId_fkey" FOREIGN KEY ("appealId") REFERENCES "Appeal" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Vote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "appealId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "note" TEXT,
    "castOn" TEXT NOT NULL,
    "isCasting" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "Vote_appealId_fkey" FOREIGN KEY ("appealId") REFERENCES "Appeal" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderNo" TEXT NOT NULL,
    "appealId" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "templateCode" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "findings" TEXT NOT NULL,
    "reasons" TEXT NOT NULL,
    "directionText" TEXT,
    "directionDays" INTEGER,
    "noPenaltyReason" TEXT,
    "penaltyPlan" TEXT,
    "disciplinaryRecommendation" TEXT,
    "majority" TEXT,
    "dissent" TEXT,
    "status" TEXT NOT NULL,
    "draftedById" TEXT NOT NULL,
    "draftedOn" TEXT NOT NULL,
    "signedById" TEXT,
    "signedOn" TEXT,
    "esignRef" TEXT,
    "authenticatedById" TEXT,
    "authenticatedOn" TEXT,
    CONSTRAINT "Order_appealId_fkey" FOREIGN KEY ("appealId") REFERENCES "Appeal" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Direction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "appealId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "assigneeId" TEXT NOT NULL,
    "issuedOn" TEXT NOT NULL,
    "dueOn" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "metOn" TEXT,
    "deliveryRef" TEXT,
    CONSTRAINT "Direction_appealId_fkey" FOREIGN KEY ("appealId") REFERENCES "Appeal" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Penalty" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "appealId" TEXT NOT NULL,
    "officerId" TEXT NOT NULL,
    "officerCapacity" TEXT NOT NULL,
    "imposedByLevel" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "delayDaysAttributed" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL,
    "imposedOn" TEXT NOT NULL,
    "paymentDueOn" TEXT NOT NULL,
    "egrasRef" TEXT NOT NULL,
    "paidOn" TEXT,
    "stayReason" TEXT,
    "stayedOn" TEXT,
    "refundReason" TEXT,
    "refundedOn" TEXT,
    CONSTRAINT "Penalty_appealId_fkey" FOREIGN KEY ("appealId") REFERENCES "Appeal" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Recovery" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "penaltyId" TEXT NOT NULL,
    "ddoId" TEXT NOT NULL,
    "directionIssuedOn" TEXT NOT NULL,
    "adviceIssuedOn" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "outstanding" INTEGER NOT NULL,
    CONSTRAINT "Recovery_penaltyId_fkey" FOREIGN KEY ("penaltyId") REFERENCES "Penalty" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RecoveryDeduction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "recoveryId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "treasuryRef" TEXT NOT NULL,
    "recordedById" TEXT NOT NULL,
    "recordedOn" TEXT NOT NULL,
    CONSTRAINT "RecoveryDeduction_recoveryId_fkey" FOREIGN KEY ("recoveryId") REFERENCES "Recovery" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "recipientId" TEXT,
    "recipientLabel" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "address" TEXT,
    "text" TEXT NOT NULL,
    "sentOn" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "caseRef" TEXT
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "simDate" TEXT NOT NULL,
    "realTs" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,
    "actorRole" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "caseRef" TEXT,
    "beforeStatus" TEXT,
    "afterStatus" TEXT,
    "outcome" TEXT NOT NULL,
    "details" TEXT
);

-- CreateTable
CREATE TABLE "AuditGuard" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "unlocked" BOOLEAN NOT NULL DEFAULT false
);

-- CreateTable
CREATE TABLE "DelayFlag" (
    "officerId" TEXT NOT NULL PRIMARY KEY,
    "computedOn" TEXT NOT NULL,
    "delayed" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "ratio" REAL NOT NULL,
    "isFlagged" BOOLEAN NOT NULL
);

-- CreateTable
CREATE TABLE "SchedulerRun" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "simDate" TEXT NOT NULL,
    "summary" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Application_uin_key" ON "Application"("uin");

-- CreateIndex
CREATE UNIQUE INDEX "Appeal_appealNo_key" ON "Appeal"("appealNo");

-- CreateIndex
CREATE UNIQUE INDEX "Bench_appealId_key" ON "Bench"("appealId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_orderNo_key" ON "Order"("orderNo");

-- CreateIndex
CREATE UNIQUE INDEX "Recovery_penaltyId_key" ON "Recovery"("penaltyId");

-- Append-only audit log: refuse UPDATE and DELETE unless a demo reset has unlocked the guard.
INSERT INTO "AuditGuard" ("id", "unlocked") VALUES (1, 0);

CREATE TRIGGER "AuditEvent_no_update" BEFORE UPDATE ON "AuditEvent"
WHEN (SELECT "unlocked" FROM "AuditGuard" WHERE "id" = 1) IS NOT 1
BEGIN
  SELECT RAISE(ABORT, 'The audit log is append-only.');
END;

CREATE TRIGGER "AuditEvent_no_delete" BEFORE DELETE ON "AuditEvent"
WHEN (SELECT "unlocked" FROM "AuditGuard" WHERE "id" = 1) IS NOT 1
BEGIN
  SELECT RAISE(ABORT, 'The audit log is append-only.');
END;
