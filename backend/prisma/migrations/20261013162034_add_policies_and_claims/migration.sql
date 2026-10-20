-- CreateEnum
CREATE TYPE "PolicyStatus" AS ENUM ('PENDING', 'ACTIVE', 'EXPIRED', 'EXHAUSTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ClaimStatus" AS ENUM ('PENDING', 'APPROVED', 'PAID', 'REJECTED');

-- CreateTable
CREATE TABLE "policies" (
    "id" UUID NOT NULL,
    "policyNumber" VARCHAR(50) NOT NULL,
    "farmId" UUID NOT NULL,
    "farmerId" UUID NOT NULL,
    "cropName" VARCHAR(100) NOT NULL,
    "sumInsured" DECIMAL(12,2) NOT NULL,
    "premiumAmount" DECIMAL(12,2) NOT NULL,
    "coveredHazards" "RiskHazardType"[],
    "startDate" TIMESTAMPTZ(6) NOT NULL,
    "endDate" TIMESTAMPTZ(6) NOT NULL,
    "cumulativePaidAmount" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    "status" "PolicyStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "claims" (
    "id" UUID NOT NULL,
    "claimNumber" VARCHAR(50) NOT NULL,
    "policyId" UUID NOT NULL,
    "assessmentId" UUID NOT NULL,
    "riskEventId" UUID NOT NULL,
    "triggerRuleCode" VARCHAR(50) NOT NULL,
    "severity" "RiskSeverity" NOT NULL,
    "observedValue" DECIMAL(10,2),
    "thresholdValue" DECIMAL(10,2) NOT NULL,
    "payoutAmount" DECIMAL(12,2) NOT NULL,
    "status" "ClaimStatus" NOT NULL DEFAULT 'PAID',
    "rejectionReason" TEXT,
    "payoutReference" VARCHAR(100),
    "paidAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "claims_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "policies_policyNumber_key" ON "policies"("policyNumber");

-- CreateIndex
CREATE INDEX "policies_farmId_status_idx" ON "policies"("farmId", "status");

-- CreateIndex
CREATE INDEX "policies_farmerId_idx" ON "policies"("farmerId");

-- CreateIndex
CREATE INDEX "policies_status_idx" ON "policies"("status");

-- CreateIndex
CREATE INDEX "policies_startDate_endDate_idx" ON "policies"("startDate", "endDate");

-- CreateIndex
CREATE UNIQUE INDEX "claims_claimNumber_key" ON "claims"("claimNumber");

-- CreateIndex
CREATE INDEX "claims_policyId_createdAt_idx" ON "claims"("policyId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "claims_assessmentId_idx" ON "claims"("assessmentId");

-- CreateIndex
CREATE INDEX "claims_riskEventId_idx" ON "claims"("riskEventId");

-- CreateIndex
CREATE INDEX "claims_status_idx" ON "claims"("status");

-- CreateIndex
CREATE UNIQUE INDEX "claims_policyId_riskEventId_key" ON "claims"("policyId", "riskEventId");

-- AddForeignKey
ALTER TABLE "policies" ADD CONSTRAINT "policies_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "farms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policies" ADD CONSTRAINT "policies_farmerId_fkey" FOREIGN KEY ("farmerId") REFERENCES "farmers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claims" ADD CONSTRAINT "claims_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "policies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claims" ADD CONSTRAINT "claims_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "risk_assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claims" ADD CONSTRAINT "claims_riskEventId_fkey" FOREIGN KEY ("riskEventId") REFERENCES "risk_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
