export type AreaUnit = 'ACRE' | 'HECTARE' | 'BIGHA' | 'GUNTHA';

export type FarmStatus = 'ACTIVE' | 'INACTIVE' | 'HARVESTED';

export const AREA_UNITS: { code: AreaUnit; label: string; description: string }[] = [
  { code: 'ACRE', label: 'Acre', description: 'Standard international acre (43,560 sq ft)' },
  { code: 'HECTARE', label: 'Hectare', description: 'Metric unit (approx. 2.47 acres)' },
  { code: 'BIGHA', label: 'Bigha', description: 'Regional Indian measure (state-dependent)' },
  { code: 'GUNTHA', label: 'Guntha', description: 'Regional Indian measure (1/40th acre)' },
];

export const FARM_STATUSES: { code: FarmStatus; label: string; badgeColor: string }[] = [
  { code: 'ACTIVE', label: 'Active', badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  { code: 'INACTIVE', label: 'Inactive', badgeColor: 'bg-slate-100 text-slate-700 border-slate-200' },
  { code: 'HARVESTED', label: 'Harvested', badgeColor: 'bg-amber-100 text-amber-800 border-amber-200' },
];

export interface FarmFarmerSummary {
  id: string;
  fullName: string;
  mobileNumber: string;
}

export interface Farm {
  id: string;
  farmerId: string;
  farmName: string;
  farmReferenceNumber: string;
  cropName: string;
  cropVariety: string | null;
  sowingDate: string;
  expectedHarvestDate: string | null;
  farmArea: number;
  farmAreaUnit: AreaUnit;
  village: string;
  district: string;
  state: string;
  pincode: string;
  status: FarmStatus;
  createdAt: string;
  updatedAt: string;
  farmer?: FarmFarmerSummary;
}

export interface CreateFarmInput {
  farmerId: string;
  farmName: string;
  cropName: string;
  cropVariety?: string;
  sowingDate: string;
  expectedHarvestDate?: string;
  farmArea: number;
  farmAreaUnit: AreaUnit;
  village: string;
  district: string;
  state: string;
  pincode: string;
  status?: FarmStatus;
}

export interface UpdateFarmInput {
  farmName?: string;
  cropName?: string;
  cropVariety?: string | null;
  sowingDate?: string;
  expectedHarvestDate?: string | null;
  farmArea?: number;
  farmAreaUnit?: AreaUnit;
  village?: string;
  district?: string;
  state?: string;
  pincode?: string;
  status?: FarmStatus;
}

export interface FarmListResponse {
  farms: Farm[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface FarmQueryParams {
  page?: number;
  limit?: number;
  search?: string;
  cropName?: string;
  state?: string;
  status?: FarmStatus;
  farmerId?: string;
}
