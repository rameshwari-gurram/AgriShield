/**
 * Copernicus Data Space Ecosystem Live Manual Verification Script
 * Module 7 Stage 7.2-B: Sentinel-2 Statistical API Live Verification
 *
 * Usage:
 *   npx tsx scripts/verifyCopernicusLive.ts
 *
 * Safety & Security Invariants:
 * - Checks credentials in .env (COPERNICUS_CLIENT_ID and COPERNICUS_CLIENT_SECRET).
 * - Never prints client secrets, raw access tokens, or Authorization headers to stdout/stderr.
 * - Queries recent 14-day window against official Sentinel Hub Statistical API.
 * - Safely handles missing credentials with informative setup instructions.
 */

import 'dotenv/config';
import { prisma } from '../src/config/db.js';
import { env } from '../src/config/env.config.js';
import { CopernicusSatelliteProvider } from '../src/providers/copernicus.provider.js';
import { GeoJSONPolygon } from '../src/types/satellite.types.js';

async function main() {
  console.log('================================================================');
  console.log('🌱 AgriShield Copernicus Data Space Live Verification (Stage 7.2-B)');
  console.log('================================================================\n');

  // 1. Credential Check
  const clientId = env.COPERNICUS_CLIENT_ID?.trim();
  const clientSecret = env.COPERNICUS_CLIENT_SECRET?.trim();

  if (!clientId || !clientSecret) {
    console.log('⚠️  Copernicus credentials are NOT configured in your environment.');
    console.log('   COPERNICUS_CLIENT_ID:     ' + (clientId ? 'Configured (hidden)' : 'MISSING'));
    console.log('   COPERNICUS_CLIENT_SECRET: ' + (clientSecret ? 'Configured (hidden)' : 'MISSING'));
    console.log('\nTo perform live verification against the Copernicus Sentinel Hub Statistical API:');
    console.log('1. Register on Copernicus Data Space: https://dataspace.copernicus.eu');
    console.log('2. Generate OAuth2 client credentials in Sentinel Hub Dashboard');
    console.log('3. Set the following in backend/.env:');
    console.log('   COPERNICUS_CLIENT_ID="<your-client-id>"');
    console.log('   COPERNICUS_CLIENT_SECRET="<your-client-secret>"');
    console.log('4. Re-run this script: npx tsx scripts/verifyCopernicusLive.ts\n');
    console.log('Automated test suite uses mocked Copernicus responses and remains 100% green without credentials.');
    return;
  }

  console.log('🔑 Credentials detected:');
  console.log(`   Client ID:     ${clientId.substring(0, 6)}...${clientId.substring(clientId.length - 4)}`);
  console.log('   Client Secret: [CONFIGURED - NEVER LOGGED]');
  console.log(`   Base URL:      ${env.COPERNICUS_BASE_URL}`);
  console.log(`   Auth URL:      ${env.COPERNICUS_AUTH_URL}\n`);

  // 2. Select Farm Boundary (authoritative spatial input)
  let polygon: GeoJSONPolygon | null = null;
  let farmName = 'Fallback Agricultural Test Parcel';
  let locationInfo = 'Baramati, Pune, Maharashtra';

  try {
    const boundaryRecord = await prisma.farmBoundary.findFirst({
      include: { farm: true },
      orderBy: { createdAt: 'desc' },
    });

    if (boundaryRecord && boundaryRecord.geojson) {
      polygon = JSON.parse(boundaryRecord.geojson) as GeoJSONPolygon;
      farmName = boundaryRecord.farm.farmName;
      locationInfo = `${boundaryRecord.farm.village}, ${boundaryRecord.farm.district}, ${boundaryRecord.farm.state}`;
      console.log(`📍 Using registered farm boundary: "${farmName}" (${locationInfo})`);
    } else {
      console.log('ℹ️  No registered farm boundaries found in database. Using default test parcel.');
    }
  } catch (dbErr: any) {
    console.log('ℹ️  Database lookup skipped or unavailable. Using default test parcel.');
  }

  if (!polygon) {
    // Default polygon: Agricultural parcel near Baramati, Maharashtra (WGS84 EPSG:4326)
    polygon = {
      type: 'Polygon',
      coordinates: [
        [
          [74.5800, 18.1500],
          [74.5850, 18.1500],
          [74.5850, 18.1550],
          [74.5800, 18.1550],
          [74.5800, 18.1500],
        ],
      ],
    };
  }

  console.log(`   Polygon Outer Ring Coordinates: ${polygon.coordinates[0].length} vertices`);
  console.log(`   Bounding Box Sample: [${polygon.coordinates[0][0][0]}, ${polygon.coordinates[0][0][1]}]\n`);

  // 3. Define 14-day Observation Window
  const now = new Date();
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  // Normalize to UTC boundaries
  const dateRange = {
    from: new Date(Date.UTC(fourteenDaysAgo.getUTCFullYear(), fourteenDaysAgo.getUTCMonth(), fourteenDaysAgo.getUTCDate())),
    to: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())),
  };

  console.log(`🛰️  Querying Copernicus Sentinel-2 MSI Level-2A Statistical API:`);
  console.log(`   Time Range: from ${dateRange.from.toISOString()} to ${dateRange.to.toISOString()}`);
  console.log(`   Resolution: 10m x 10m`);
  console.log(`   Aggregation: P1D (daily)`);
  console.log(`   Bands: B04 (Red, 665nm), B08 (NIR, 842nm), dataMask\n`);

  // 4. Dispatch live query
  const provider = new CopernicusSatelliteProvider();

  try {
    const startTime = Date.now();
    const observations = await provider.fetchNdviObservations(polygon, dateRange);
    const durationMs = Date.now() - startTime;

    console.log(`✅ Copernicus API query completed in ${durationMs}ms`);
    console.log(`   Normalized Observations Found: ${observations.length}\n`);

    if (observations.length === 0) {
      console.log('   (No clear Sentinel-2 overpasses with valid data in the selected 14-day window for this parcel.)');
    } else {
      console.log('   Observation Summary:');
      console.log('   --------------------------------------------------------------------------------------------------');
      console.log('   | Observed At (UTC)        | Observation / Product ID      | Mean NDVI | Min   | Max   | Valid Pix % |');
      console.log('   --------------------------------------------------------------------------------------------------');
      for (const obs of observations) {
        const obsTime = obs.observedAt.toISOString();
        const prodId = obs.satellite.productId.padEnd(29, ' ').substring(0, 29);
        const meanStr = obs.ndvi.meanNdvi.toFixed(4).padStart(9, ' ');
        const minStr = obs.ndvi.minNdvi.toFixed(4).padStart(5, ' ');
        const maxStr = obs.ndvi.maxNdvi.toFixed(4).padStart(5, ' ');
        const validPix = (obs.ndvi.validPixelPercentage.toFixed(1) + '%').padStart(11, ' ');
        console.log(`   | ${obsTime} | ${prodId} | ${meanStr} | ${minStr} | ${maxStr} | ${validPix} |`);
      }
      console.log('   --------------------------------------------------------------------------------------------------\n');
    }

    console.log('🎉 Live Copernicus Data Space Ecosystem verification completed successfully!');
  } catch (error: any) {
    console.error('\n❌ Error during live Copernicus query:');
    console.error(`   Message:    ${error.message}`);
    console.error(`   StatusCode: ${error.statusCode || 'N/A'}`);
    if (error.details) {
      console.error(`   Details:    ${JSON.stringify(error.details)}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('Fatal error in verifyCopernicusLive:', err);
  process.exit(1);
});
