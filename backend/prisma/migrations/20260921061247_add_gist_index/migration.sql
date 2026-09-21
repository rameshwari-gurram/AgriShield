-- CreateIndex
CREATE INDEX "farm_boundaries_geom_idx" ON "farm_boundaries" USING GIST ("geom");
