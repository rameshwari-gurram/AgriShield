/**
 * Sentinel-2 L2A Evalscript and Request Builder for Copernicus Statistical API
 * Module 7 Stage 7.2-B: Satellite Data & NDVI Foundation
 *
 * Implements Evalscript v3 requesting:
 * - B04: Red (665 nm)
 * - B08: Near-Infrared / NIR (842 nm)
 * - dataMask: Pixel validity and farm parcel clipping mask
 *
 * Mathematical Invariants:
 * - NDVI = (B08 - B04) / (B08 + B04)
 * - Zero denominator protection: if (B08 + B04 === 0), pixel is masked out (dataMask = 0).
 * - Enforces [-1.0, 1.0] range and rejects NaN / Infinity.
 * - Spatial resolution: 10 meters (native Sentinel-2 MSI visible/NIR bands).
 */

import { GeoJSONPolygon } from '../types/satellite.types.js';

export const SENTINEL2_NDVI_EVALSCRIPT = `//VERSION=3
function setup() {
  return {
    input: [{
      bands: ["B04", "B08", "dataMask"]
    }],
    output: [
      { id: "data", bands: 1 },
      { id: "dataMask", bands: 1 }
    ]
  };
}

function evaluatePixel(samples) {
  var b04 = samples.B04;
  var b08 = samples.B08;
  var mask = samples.dataMask;

  // 1. Exclude if pixel is outside farm boundary or sensor no-data
  if (mask === 0) {
    return {
      data: [0],
      dataMask: [0]
    };
  }

  // 2. Division by zero protection
  var denom = b08 + b04;
  if (denom === 0 || isNaN(denom)) {
    return {
      data: [0],
      dataMask: [0]
    };
  }

  var ndvi = (b08 - b04) / denom;

  // 3. Mathematical bounds verification [-1.0, 1.0] and finiteness
  if (isNaN(ndvi) || !isFinite(ndvi) || ndvi < -1.0 || ndvi > 1.0) {
    return {
      data: [0],
      dataMask: [0]
    };
  }

  return {
    data: [ndvi],
    dataMask: [1]
  };
}
`;

/**
 * Builds the official request payload for the Sentinel Hub Statistical API v1 (POST /statistics/v1).
 *
 * Cloud Filtering Design:
 * Scene-level cloud filtering via `maxCloudCoverage` is intentionally NOT configured by default.
 * Sentinel-2 scenes cover ~10,000 km² (100km x 100km); filtering at the entire scene tile level
 * would discard completely clear, cloud-free observations over a small farm parcel if distant
 * areas in the tile are overcast.
 * Instead, pixel-level cloud and validity masking occurs directly at parcel scale via `dataMask`
 * inside the evalscript, yielding parcel-specific `validPixelPercentage`.
 * When scene-level pre-filtering is explicitly requested, the official Copernicus Sentinel Hub
 * `maxCloudCoverage` field (percentage 0-100) is injected into `dataFilter`.
 */
export function buildCopernicusStatisticalRequest(
  boundary: GeoJSONPolygon,
  dateRange: { from: Date; to: Date },
  options?: {
    maxCloudCoverage?: number;
  }
) {
  const dataFilter: Record<string, any> = {
    mosaickingOrder: 'leastRecent',
  };

  if (
    typeof options?.maxCloudCoverage === 'number' &&
    !isNaN(options.maxCloudCoverage) &&
    options.maxCloudCoverage >= 0 &&
    options.maxCloudCoverage <= 100
  ) {
    dataFilter.maxCloudCoverage = options.maxCloudCoverage;
  }

  return {
    input: {
      bounds: {
        geometry: {
          type: boundary.type,
          coordinates: boundary.coordinates,
        },
        properties: {
          crs: 'http://www.opengis.net/def/crs/EPSG/0/4326',
        },
      },
      data: [
        {
          type: 'sentinel-2-l2a',
          dataFilter,
        },
      ],
    },
    aggregation: {
      timeRange: {
        from: dateRange.from.toISOString(),
        to: dateRange.to.toISOString(),
      },
      aggregationInterval: {
        of: 'P1D',
      },
      evalscript: SENTINEL2_NDVI_EVALSCRIPT,
      resx: 10,
      resy: 10,
    },
  };
}
