-- CreateTable
CREATE TABLE "satellite_observations" (
    "id" UUID NOT NULL,
    "farmId" UUID NOT NULL,
    "observedAt" TIMESTAMPTZ(6) NOT NULL,
    "provider" VARCHAR(50) NOT NULL,
    "satellite" VARCHAR(50) NOT NULL,
    "productType" VARCHAR(50) NOT NULL,
    "productId" VARCHAR(150) NOT NULL,
    "cloudCoverage" DECIMAL(5,2) NOT NULL,
    "sourceReference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "satellite_observations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ndvi_observations" (
    "id" UUID NOT NULL,
    "farmId" UUID NOT NULL,
    "satelliteObservationId" UUID NOT NULL,
    "observedAt" TIMESTAMPTZ(6) NOT NULL,
    "meanNdvi" DECIMAL(5,4) NOT NULL,
    "minNdvi" DECIMAL(5,4) NOT NULL,
    "maxNdvi" DECIMAL(5,4) NOT NULL,
    "validPixelPercentage" DECIMAL(5,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ndvi_observations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "satellite_observations_farmId_observedAt_idx" ON "satellite_observations"("farmId", "observedAt" DESC);

-- CreateIndex
CREATE INDEX "satellite_observations_productId_idx" ON "satellite_observations"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "satellite_observations_farmId_productId_key" ON "satellite_observations"("farmId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "satellite_observations_farmId_observedAt_key" ON "satellite_observations"("farmId", "observedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ndvi_observations_satelliteObservationId_key" ON "ndvi_observations"("satelliteObservationId");

-- CreateIndex
CREATE INDEX "ndvi_observations_farmId_observedAt_idx" ON "ndvi_observations"("farmId", "observedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "ndvi_observations_farmId_observedAt_key" ON "ndvi_observations"("farmId", "observedAt");

-- AddForeignKey
ALTER TABLE "satellite_observations" ADD CONSTRAINT "satellite_observations_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "farms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ndvi_observations" ADD CONSTRAINT "ndvi_observations_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "farms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ndvi_observations" ADD CONSTRAINT "ndvi_observations_satelliteObservationId_fkey" FOREIGN KEY ("satelliteObservationId") REFERENCES "satellite_observations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
