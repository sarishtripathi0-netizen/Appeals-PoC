-- AlterTable
ALTER TABLE "Application" ADD COLUMN "daId" TEXT;
ALTER TABLE "Application" ADD COLUMN "feeRef" TEXT;
ALTER TABLE "Application" ADD COLUMN "stage" TEXT;
ALTER TABLE "Application" ADD COLUMN "systemCheck" TEXT;
ALTER TABLE "Application" ADD COLUMN "timeLimitDays" INTEGER;

-- AlterTable
ALTER TABLE "AuthorityMapping" ADD COLUMN "daId" TEXT;

-- AlterTable
ALTER TABLE "Service" ADD COLUMN "eligibility" TEXT;
ALTER TABLE "Service" ADD COLUMN "faaDays" INTEGER;
ALTER TABLE "Service" ADD COLUMN "fees" TEXT;
ALTER TABLE "Service" ADD COLUMN "formFields" TEXT;
ALTER TABLE "Service" ADD COLUMN "maxReverts" INTEGER;
ALTER TABLE "Service" ADD COLUMN "notificationRef" TEXT;
ALTER TABLE "Service" ADD COLUMN "saaDays" INTEGER;
ALTER TABLE "Service" ADD COLUMN "workflow" TEXT;
