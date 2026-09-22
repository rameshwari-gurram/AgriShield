-- CreateTable
CREATE TABLE "weather_records" (
    "id" UUID NOT NULL,
    "farmId" UUID NOT NULL,
    "observedAt" TIMESTAMPTZ(6) NOT NULL,
    "latitude" DECIMAL(9,6) NOT NULL,
    "longitude" DECIMAL(9,6) NOT NULL,
    "temperatureC" DECIMAL(5,2) NOT NULL,
    "humidityPercent" DECIMAL(5,2) NOT NULL,
    "rainfallMm" DECIMAL(7,2) NOT NULL,
    "windSpeedKmh" DECIMAL(6,2) NOT NULL,
    "windGustKmh" DECIMAL(6,2) NOT NULL,
    "weatherCode" INTEGER NOT NULL,
    "source" VARCHAR(50) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "weather_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "weather_records_farmId_observedAt_idx" ON "weather_records"("farmId", "observedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "weather_records_farmId_observedAt_key" ON "weather_records"("farmId", "observedAt");

-- AddForeignKey
ALTER TABLE "weather_records" ADD CONSTRAINT "weather_records_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "farms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
