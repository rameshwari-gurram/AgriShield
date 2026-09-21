export interface GeoJSONPolygon {
  type: 'Polygon';
  coordinates: number[][][]; // [ [ [longitude, latitude], ... ] ]
}

export interface FarmBoundary {
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

export interface CreateFarmBoundaryInput {
  boundary: GeoJSONPolygon;
}

export interface UpdateFarmBoundaryInput {
  boundary: GeoJSONPolygon;
}
