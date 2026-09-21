export interface GeoJSONPolygon {
  type: 'Polygon';
  coordinates: number[][][]; // Array of linear rings, each ring is an array of [longitude, latitude]
}

export interface CreateFarmBoundaryDTO {
  boundary: GeoJSONPolygon;
}

export interface UpdateFarmBoundaryDTO {
  boundary: GeoJSONPolygon;
}

export interface FarmBoundaryResponseDTO {
  id: string;
  farmId: string;
  boundary: GeoJSONPolygon;
  calculatedAreaSqM: number;
  calculatedAreaHectares: number;
  calculatedAreaAcres: number;
  centroidLatitude: number;
  centroidLongitude: number;
  createdAt: string;
  updatedAt: string;
}

export interface RawBoundaryResult {
  id: string;
  farmId: string;
  geojson: string;
  calculatedAreaSqM: number;
  calculatedAreaHectares: number;
  calculatedAreaAcres: number;
  centroidLatitude: number;
  centroidLongitude: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface GeometryValidationResult {
  isValid: boolean;
  reason: string | null;
  areaSqM?: number;
  centroidLon?: number;
  centroidLat?: number;
}

export interface IFarmBoundaryRepository {
  validateGeometry(geojsonStr: string): Promise<GeometryValidationResult>;
  create(farmId: string, geojsonStr: string): Promise<RawBoundaryResult>;
  findByFarmId(farmId: string): Promise<RawBoundaryResult | null>;
  update(farmId: string, geojsonStr: string): Promise<RawBoundaryResult>;
  deleteByFarmId(farmId: string): Promise<boolean>;
}
