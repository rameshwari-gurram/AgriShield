-- Enable PostGIS extension if not already enabled
CREATE EXTENSION IF NOT EXISTS postgis;

-- CreateTable
CREATE TABLE "farm_boundaries" (
    "id" UUID NOT NULL,
    "farmId" UUID NOT NULL,
    "geom" geometry(Polygon, 4326) NOT NULL,
    "calculatedAreaSqM" DECIMAL(14,2) NOT NULL,
    "calculatedAreaHectares" DECIMAL(10,4) NOT NULL,
    "calculatedAreaAcres" DECIMAL(10,4) NOT NULL,
    "centroidLatitude" DECIMAL(9,6) NOT NULL,
    "centroidLongitude" DECIMAL(9,6) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "farm_boundaries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "farm_boundaries_farmId_key" ON "farm_boundaries"("farmId");

-- Create Spatial GiST Index
CREATE INDEX "farm_boundaries_geom_idx" ON "farm_boundaries" USING GIST ("geom");

-- AddForeignKey
ALTER TABLE "farm_boundaries" ADD CONSTRAINT "farm_boundaries_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "farms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
