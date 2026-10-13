-- CreateTable
CREATE TABLE "ml_risk_predictions" (
    "id" UUID NOT NULL,
    "farmId" UUID NOT NULL,
    "assessedAt" TIMESTAMPTZ(6) NOT NULL,
    "inputFingerprint" VARCHAR(64) NOT NULL,
    "predictedClass" INTEGER NOT NULL,
    "calibratedProbability" DECIMAL(6,5) NOT NULL,
    "rawDecisionMargin" DECIMAL(10,5) NOT NULL,
    "featureSnapshot" JSONB NOT NULL,
    "shapExplanation" JSONB NOT NULL,
    "modelName" VARCHAR(100) NOT NULL,
    "modelVersion" VARCHAR(50) NOT NULL,
    "featureContractVersion" VARCHAR(20) NOT NULL,
    "disclaimer" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ml_risk_predictions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ml_risk_predictions_farmId_assessedAt_idx" ON "ml_risk_predictions"("farmId", "assessedAt" DESC);

-- CreateIndex
CREATE INDEX "ml_risk_predictions_farmId_inputFingerprint_idx" ON "ml_risk_predictions"("farmId", "inputFingerprint");

-- CreateIndex
CREATE INDEX "ml_risk_predictions_assessedAt_idx" ON "ml_risk_predictions"("assessedAt");

-- AddForeignKey
ALTER TABLE "ml_risk_predictions" ADD CONSTRAINT "ml_risk_predictions_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "farms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
