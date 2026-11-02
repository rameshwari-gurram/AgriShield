-- AlterTable
ALTER TABLE "farmers" ADD COLUMN "email" VARCHAR(255);

-- CreateIndex
CREATE UNIQUE INDEX "farmers_email_key" ON "farmers"("email");

