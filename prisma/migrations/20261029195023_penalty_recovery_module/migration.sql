/*
  Warnings:

  - You are about to drop the `Recovery` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `RecoveryDeduction` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the column `egrasRef` on the `Penalty` table. All the data in the column will be lost.
  - You are about to drop the column `imposedOn` on the `Penalty` table. All the data in the column will be lost.
  - You are about to drop the column `officerCapacity` on the `Penalty` table. All the data in the column will be lost.
  - You are about to drop the column `paidOn` on the `Penalty` table. All the data in the column will be lost.
  - You are about to drop the column `paymentDueOn` on the `Penalty` table. All the data in the column will be lost.
  - You are about to drop the column `refundReason` on the `Penalty` table. All the data in the column will be lost.
  - You are about to drop the column `refundedOn` on the `Penalty` table. All the data in the column will be lost.
  - You are about to drop the column `stayReason` on the `Penalty` table. All the data in the column will be lost.
  - You are about to drop the column `stayedOn` on the `Penalty` table. All the data in the column will be lost.
  - You are about to drop the column `ddoId` on the `User` table. All the data in the column will be lost.
  - Added the required column `appealNo` to the `Penalty` table without a default value. This is not possible if the table is not empty.
  - Added the required column `capacity` to the `Penalty` table without a default value. This is not possible if the table is not empty.
  - Added the required column `dashboardPostedAt` to the `Penalty` table without a default value. This is not possible if the table is not empty.
  - Added the required column `dashboardPostedOn` to the `Penalty` table without a default value. This is not possible if the table is not empty.
  - Added the required column `designation` to the `Penalty` table without a default value. This is not possible if the table is not empty.
  - Added the required column `dueOn` to the `Penalty` table without a default value. This is not possible if the table is not empty.
  - Added the required column `employeeId` to the `Penalty` table without a default value. This is not possible if the table is not empty.
  - Added the required column `headOfAccount` to the `Penalty` table without a default value. This is not possible if the table is not empty.
  - Added the required column `imposedById` to the `Penalty` table without a default value. This is not possible if the table is not empty.
  - Added the required column `office` to the `Penalty` table without a default value. This is not possible if the table is not empty.
  - Added the required column `officerName` to the `Penalty` table without a default value. This is not possible if the table is not empty.
  - Added the required column `orderDate` to the `Penalty` table without a default value. This is not possible if the table is not empty.
  - Added the required column `originalAmount` to the `Penalty` table without a default value. This is not possible if the table is not empty.
  - Added the required column `ref` to the `Penalty` table without a default value. This is not possible if the table is not empty.
  - Added the required column `serviceDate` to the `Penalty` table without a default value. This is not possible if the table is not empty.
  - Added the required column `uin` to the `Penalty` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "Recovery_penaltyId_key";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "Recovery";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "RecoveryDeduction";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "StaffRecord" (
    "employeeId" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "designation" TEXT NOT NULL,
    "office" TEXT NOT NULL,
    "monthlyPay" INTEGER NOT NULL,
    "payrollType" TEXT NOT NULL,
    "retirementOn" TEXT,
    "status" TEXT NOT NULL,
    "competentAuthorityId" TEXT
);

-- CreateTable
CREATE TABLE "PaymentGRN" (
    "grn" TEXT NOT NULL PRIMARY KEY,
    "scannedRef" TEXT NOT NULL,
    "penaltyId" TEXT,
    "amount" INTEGER NOT NULL,
    "channel" TEXT NOT NULL,
    "paidOn" TEXT NOT NULL,
    "paidAt" TEXT NOT NULL,
    "settlesOn" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "forceFail" BOOLEAN NOT NULL DEFAULT false,
    "settledOn" TEXT,
    CONSTRAINT "PaymentGRN_penaltyId_fkey" FOREIGN KEY ("penaltyId") REFERENCES "Penalty" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RecoveryDirection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "penaltyId" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "reference" TEXT,
    "status" TEXT NOT NULL,
    "competentAuthorityId" TEXT,
    "sentOn" TEXT NOT NULL,
    "signedOn" TEXT,
    "esignRef" TEXT,
    "remindersSent" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "RecoveryDirection_penaltyId_fkey" FOREIGN KEY ("penaltyId") REFERENCES "Penalty" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Ticket" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ticketNo" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "officerId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "assigneeId" TEXT NOT NULL,
    "bothOnLeave" BOOLEAN NOT NULL DEFAULT false,
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "createdOn" TEXT NOT NULL,
    "plan" TEXT NOT NULL,
    "escalatedOn" TEXT,
    "closedOn" TEXT
);

-- CreateTable
CREATE TABLE "TicketLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ticketId" TEXT NOT NULL,
    "penaltyId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "note" TEXT,
    "addedOn" TEXT NOT NULL,
    CONSTRAINT "TicketLine_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TicketLine_penaltyId_fkey" FOREIGN KEY ("penaltyId") REFERENCES "Penalty" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Deduction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "penaltyId" TEXT NOT NULL,
    "ticketLineId" TEXT,
    "kind" TEXT NOT NULL,
    "payrollRef" TEXT NOT NULL,
    "salaryMonth" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "voucherNo" TEXT NOT NULL,
    "proofFile" TEXT NOT NULL,
    "recordedById" TEXT NOT NULL,
    "recordedOn" TEXT NOT NULL,
    "verification" TEXT NOT NULL DEFAULT 'SUBMITTED',
    "returnReason" TEXT,
    "verifiedById" TEXT,
    "verifiedOn" TEXT,
    "credit" TEXT NOT NULL DEFAULT 'AWAITED',
    "creditedOn" TEXT,
    "creditMissingOn" TEXT,
    "escalatedOn" TEXT,
    CONSTRAINT "Deduction_penaltyId_fkey" FOREIGN KEY ("penaltyId") REFERENCES "Penalty" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CreditFeedEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "voucherNo" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "headOfAccount" TEXT NOT NULL,
    "expectedOn" TEXT NOT NULL,
    "arrivedOn" TEXT,
    "dropped" BOOLEAN NOT NULL DEFAULT false,
    "deductionId" TEXT
);

-- CreateTable
CREATE TABLE "Refund" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "penaltyId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "assigneeId" TEXT,
    "reference" TEXT,
    "createdOn" TEXT NOT NULL,
    "refundedOn" TEXT,
    CONSTRAINT "Refund_penaltyId_fkey" FOREIGN KEY ("penaltyId") REFERENCES "Penalty" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Stay" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "penaltyId" TEXT NOT NULL,
    "authority" TEXT NOT NULL,
    "orderRef" TEXT NOT NULL,
    "documentName" TEXT NOT NULL,
    "recordedById" TEXT NOT NULL,
    "startOn" TEXT NOT NULL,
    "liftedOn" TEXT,
    "priorStatus" TEXT NOT NULL,
    "daysRemaining" INTEGER,
    CONSTRAINT "Stay_penaltyId_fkey" FOREIGN KEY ("penaltyId") REFERENCES "Penalty" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Adjustment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "penaltyId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "fromAmount" INTEGER NOT NULL,
    "toAmount" INTEGER NOT NULL,
    "byAuthority" TEXT NOT NULL,
    "orderRef" TEXT NOT NULL,
    "documentName" TEXT NOT NULL,
    "recordedById" TEXT NOT NULL,
    "recordedOn" TEXT NOT NULL,
    CONSTRAINT "Adjustment_penaltyId_fkey" FOREIGN KEY ("penaltyId") REFERENCES "Penalty" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ExceptionCase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "penaltyId" TEXT,
    "grn" TEXT,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "note" TEXT,
    "letterRef" TEXT,
    "letterOn" TEXT,
    "replyRef" TEXT,
    "replyOn" TEXT,
    "proofFile" TEXT,
    "resolution" TEXT,
    "openedOn" TEXT NOT NULL,
    "resolvedOn" TEXT,
    CONSTRAINT "ExceptionCase_penaltyId_fkey" FOREIGN KEY ("penaltyId") REFERENCES "Penalty" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WriteOff" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "penaltyId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "requestedOn" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "decidedById" TEXT,
    "decidedOn" TEXT,
    "decisionNote" TEXT,
    "esignRef" TEXT,
    CONSTRAINT "WriteOff_penaltyId_fkey" FOREIGN KEY ("penaltyId") REFERENCES "Penalty" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MonthlyStatement" (
    "month" TEXT NOT NULL PRIMARY KEY,
    "generatedOn" TEXT NOT NULL,
    "rows" TEXT NOT NULL,
    "totals" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "assigneeId" TEXT NOT NULL,
    "penaltyId" TEXT,
    "ticketId" TEXT,
    "dueOn" TEXT,
    "status" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdOn" TEXT NOT NULL,
    "doneOn" TEXT
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Penalty" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ref" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "appealId" TEXT NOT NULL,
    "officerId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "officerName" TEXT NOT NULL,
    "designation" TEXT NOT NULL,
    "office" TEXT NOT NULL,
    "capacity" TEXT NOT NULL,
    "imposedByLevel" TEXT NOT NULL,
    "imposedById" TEXT NOT NULL,
    "competentAuthorityId" TEXT,
    "uin" TEXT NOT NULL,
    "appealNo" TEXT NOT NULL,
    "originalAmount" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,
    "orderDate" TEXT NOT NULL,
    "dashboardPostedOn" TEXT NOT NULL,
    "dashboardPostedAt" TEXT NOT NULL,
    "messageSentOn" TEXT,
    "messageSentAt" TEXT,
    "serviceDate" TEXT NOT NULL,
    "firstViewedOn" TEXT,
    "firstViewedAt" TEXT,
    "dueOn" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "priorStatus" TEXT,
    "qrActive" BOOLEAN NOT NULL DEFAULT true,
    "headOfAccount" TEXT NOT NULL,
    "doubleRecovery" BOOLEAN NOT NULL DEFAULT false,
    "retirementAlertOn" TEXT,
    "overdueOn" TEXT,
    "unpaidConfirmedOn" TEXT,
    "closedOn" TEXT,
    "delayDaysAttributed" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "Penalty_appealId_fkey" FOREIGN KEY ("appealId") REFERENCES "Appeal" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
-- Penalties of the superseded per-office model are demo data with no deemed-service or employee details;
-- they are not carried over. Run `npm run setup` (or Reset demo data) to reseed.
DROP TABLE "Penalty";
ALTER TABLE "new_Penalty" RENAME TO "Penalty";
CREATE UNIQUE INDEX "Penalty_ref_key" ON "Penalty"("ref");
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "designation" TEXT,
    "officeId" TEXT,
    "mobile" TEXT,
    "email" TEXT,
    "username" TEXT,
    "password" TEXT,
    "employeeId" TEXT,
    "onLeave" BOOLEAN NOT NULL DEFAULT false,
    "isBackup" BOOLEAN NOT NULL DEFAULT false,
    "hasDigitalAccess" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "User_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "Office" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_User" ("designation", "email", "hasDigitalAccess", "id", "mobile", "name", "officeId", "password", "role", "username") SELECT "designation", "email", "hasDigitalAccess", "id", "mobile", "name", "officeId", "password", "role", "username" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
CREATE UNIQUE INDEX "User_employeeId_key" ON "User"("employeeId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_ticketNo_key" ON "Ticket"("ticketNo");
