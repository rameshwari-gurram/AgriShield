/**
 * Satellite Provider Abstraction Contract
 * Decouples external satellite imagery and vegetation data vendors (Copernicus Data Space,
 * Sentinel Hub, Planet Labs, etc.) from AgriShield domain services.
 */

import {
  ISatelliteProvider,
  NormalizedSatelliteObservationDTO,
  NormalizedNdviMetricsDTO,
  NormalizedNdviObservationDTO,
  GeoJSONPolygon,
} from '../types/satellite.types.js';

export {
  ISatelliteProvider,
  NormalizedSatelliteObservationDTO,
  NormalizedNdviMetricsDTO,
  NormalizedNdviObservationDTO,
  GeoJSONPolygon,
};
