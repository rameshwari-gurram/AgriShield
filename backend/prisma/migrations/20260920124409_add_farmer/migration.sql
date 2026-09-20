-- CreateEnum
CREATE TYPE "Language" AS ENUM ('en', 'hi', 'mr', 'te', 'ta', 'kn', 'gu', 'bn', 'pa');

-- CreateTable
CREATE TABLE "farmers" (
    "id" UUID NOT NULL,
    "fullName" VARCHAR(100) NOT NULL,
    "mobileNumber" VARCHAR(15) NOT NULL,
    "preferredLanguage" "Language" NOT NULL DEFAULT 'en',
    "farmerReferenceNumber" VARCHAR(50),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "farmers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "farmers_mobileNumber_key" ON "farmers"("mobileNumber");

-- CreateIndex
CREATE UNIQUE INDEX "farmers_farmerReferenceNumber_key" ON "farmers"("farmerReferenceNumber");

-- CreateIndex
CREATE INDEX "farmers_farmerReferenceNumber_idx" ON "farmers"("farmerReferenceNumber");
