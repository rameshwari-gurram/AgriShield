-- CreateEnum
CREATE TYPE "AreaUnit" AS ENUM ('ACRE', 'HECTARE', 'BIGHA', 'GUNTHA');

-- CreateEnum
CREATE TYPE "FarmStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'HARVESTED');

-- CreateTable
CREATE TABLE "farms" (
    "id" UUID NOT NULL,
    "farmerId" UUID NOT NULL,
    "farmName" VARCHAR(100) NOT NULL,
    "farmReferenceNumber" VARCHAR(50) NOT NULL,
    "cropName" VARCHAR(100) NOT NULL,
    "cropVariety" VARCHAR(100),
    "sowingDate" DATE NOT NULL,
    "expectedHarvestDate" DATE,
    "farmArea" DECIMAL(10,2) NOT NULL,
    "farmAreaUnit" "AreaUnit" NOT NULL DEFAULT 'ACRE',
    "village" VARCHAR(100) NOT NULL,
    "district" VARCHAR(100) NOT NULL,
    "state" VARCHAR(100) NOT NULL,
    "pincode" VARCHAR(6) NOT NULL,
    "status" "FarmStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "farms_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "farms_farmReferenceNumber_key" ON "farms"("farmReferenceNumber");

-- CreateIndex
CREATE INDEX "farms_farmerId_idx" ON "farms"("farmerId");

-- CreateIndex
CREATE INDEX "farms_cropName_idx" ON "farms"("cropName");

-- CreateIndex
CREATE INDEX "farms_state_district_idx" ON "farms"("state", "district");

-- AddForeignKey
ALTER TABLE "farms" ADD CONSTRAINT "farms_farmerId_fkey" FOREIGN KEY ("farmerId") REFERENCES "farmers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
