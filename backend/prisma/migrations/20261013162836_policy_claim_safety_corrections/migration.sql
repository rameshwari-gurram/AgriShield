-- DropForeignKey
ALTER TABLE "claims" DROP CONSTRAINT "claims_assessmentId_fkey";

-- DropForeignKey
ALTER TABLE "claims" DROP CONSTRAINT "claims_policyId_fkey";

-- DropForeignKey
ALTER TABLE "claims" DROP CONSTRAINT "claims_riskEventId_fkey";

-- DropForeignKey
ALTER TABLE "policies" DROP CONSTRAINT "policies_farmId_fkey";

-- AlterTable
ALTER TABLE "claims" ALTER COLUMN "status" SET DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "policies" ALTER COLUMN "status" SET DEFAULT 'PENDING';

-- AddForeignKey
ALTER TABLE "policies" ADD CONSTRAINT "policies_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "farms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claims" ADD CONSTRAINT "claims_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "policies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claims" ADD CONSTRAINT "claims_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "risk_assessments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claims" ADD CONSTRAINT "claims_riskEventId_fkey" FOREIGN KEY ("riskEventId") REFERENCES "risk_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
