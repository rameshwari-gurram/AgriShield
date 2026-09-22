-- CreateEnum
CREATE TYPE "RiskSeverity" AS ENUM ('LOW', 'MODERATE', 'HIGH', 'VERY_HIGH');

-- CreateEnum
CREATE TYPE "RiskLevel" AS ENUM ('LOW', 'MODERATE', 'HIGH');

-- CreateEnum
CREATE TYPE "RiskSourceType" AS ENUM ('OFFICIAL_REFERENCE', 'PROJECT_INDICATOR');

-- CreateEnum
CREATE TYPE "RiskHazardType" AS ENUM ('HEAVY_RAINFALL', 'INTENSE_RAINFALL', 'HIGH_TEMPERATURE', 'STRONG_WIND');

-- CreateEnum
CREATE TYPE "RiskMeasurement" AS ENUM ('RAINFALL', 'TEMPERATURE', 'WIND_SPEED', 'WIND_GUST');

-- CreateTable
CREATE TABLE "risk_rules" (
    "id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "hazardType" "RiskHazardType" NOT NULL,
    "measurement" "RiskMeasurement" NOT NULL,
    "threshold" DECIMAL(10,2) NOT NULL,
    "thresholdUnit" VARCHAR(20) NOT NULL,
    "observationWindow" VARCHAR(50) NOT NULL,
    "severity" "RiskSeverity" NOT NULL,
    "sourceType" "RiskSourceType" NOT NULL DEFAULT 'OFFICIAL_REFERENCE',
    "sourceReference" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "risk_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "risk_assessments" (
    "id" UUID NOT NULL,
    "farmId" UUID NOT NULL,
    "assessedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "overallRisk" "RiskLevel" NOT NULL,
    "assessmentVersion" VARCHAR(20) NOT NULL DEFAULT '1.0.0',
    "ruleCount" INTEGER NOT NULL,
    "triggeredRuleCount" INTEGER NOT NULL,
    "weatherRecordCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "risk_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "risk_events" (
    "id" UUID NOT NULL,
    "assessmentId" UUID NOT NULL,
    "riskRuleId" UUID NOT NULL,
    "observedValue" DECIMAL(10,2) NOT NULL,
    "thresholdValue" DECIMAL(10,2) NOT NULL,
    "unit" VARCHAR(20) NOT NULL,
    "severity" "RiskSeverity" NOT NULL,
    "triggered" BOOLEAN NOT NULL,
    "explanation" TEXT NOT NULL,
    "observedAt" TIMESTAMPTZ(6) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "risk_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "risk_rules_code_key" ON "risk_rules"("code");

-- CreateIndex
CREATE INDEX "risk_rules_hazardType_idx" ON "risk_rules"("hazardType");

-- CreateIndex
CREATE INDEX "risk_rules_isActive_idx" ON "risk_rules"("isActive");

-- CreateIndex
CREATE INDEX "risk_assessments_farmId_assessedAt_idx" ON "risk_assessments"("farmId", "assessedAt" DESC);

-- CreateIndex
CREATE INDEX "risk_assessments_overallRisk_idx" ON "risk_assessments"("overallRisk");

-- CreateIndex
CREATE INDEX "risk_events_assessmentId_idx" ON "risk_events"("assessmentId");

-- CreateIndex
CREATE INDEX "risk_events_riskRuleId_idx" ON "risk_events"("riskRuleId");

-- CreateIndex
CREATE INDEX "risk_events_triggered_idx" ON "risk_events"("triggered");

-- AddForeignKey
ALTER TABLE "risk_assessments" ADD CONSTRAINT "risk_assessments_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "farms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_events" ADD CONSTRAINT "risk_events_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "risk_assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_events" ADD CONSTRAINT "risk_events_riskRuleId_fkey" FOREIGN KEY ("riskRuleId") REFERENCES "risk_rules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
