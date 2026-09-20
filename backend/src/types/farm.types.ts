import { Farm, Farmer, AreaUnit, FarmStatus } from '@prisma/client';

export { AreaUnit, FarmStatus };

export interface CreateFarmDTO {
  farmerId: string;
  farmName: string;
  cropName: string;
  cropVariety?: string | null;
  sowingDate: string;
  expectedHarvestDate?: string | null;
  farmArea: number;
  farmAreaUnit?: AreaUnit;
  village: string;
  district: string;
  state: string;
  pincode: string;
  status?: FarmStatus;
}

export interface UpdateFarmDTO {
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

export interface FarmFarmerSummaryDTO {
  id: string;
  fullName: string;
  mobileNumber: string;
}

export interface FarmResponseDTO {
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
  farmer?: FarmFarmerSummaryDTO;
}

export interface FarmQueryDTO {
  page?: number;
  limit?: number;
  search?: string;
  cropName?: string;
  state?: string;
  status?: FarmStatus;
  farmerId?: string;
}

export interface FarmListResponseDTO {
  farms: FarmResponseDTO[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface IFarmRepository {
  create(data: {
    farmerId: string;
    farmName: string;
    farmReferenceNumber: string;
    cropName: string;
    cropVariety?: string | null;
    sowingDate: Date;
    expectedHarvestDate?: Date | null;
    farmArea: number;
    farmAreaUnit: AreaUnit;
    village: string;
    district: string;
    state: string;
    pincode: string;
    status: FarmStatus;
  }): Promise<Farm & { farmer?: Farmer }>;
  findById(id: string, includeFarmer?: boolean): Promise<(Farm & { farmer?: Farmer }) | null>;
  findByReferenceNumber(farmReferenceNumber: string): Promise<Farm | null>;
  findByFarmerId(farmerId: string): Promise<(Farm & { farmer?: Farmer })[]>;
  findAll(options: {
    skip: number;
    take: number;
    search?: string;
    cropName?: string;
    state?: string;
    status?: FarmStatus;
    farmerId?: string;
    includeFarmer?: boolean;
  }): Promise<(Farm & { farmer?: Farmer })[]>;
  count(filters?: {
    search?: string;
    cropName?: string;
    state?: string;
    status?: FarmStatus;
    farmerId?: string;
  }): Promise<number>;
  update(
    id: string,
    data: {
      farmName?: string;
      cropName?: string;
      cropVariety?: string | null;
      sowingDate?: Date;
      expectedHarvestDate?: Date | null;
      farmArea?: number;
      farmAreaUnit?: AreaUnit;
      village?: string;
      district?: string;
      state?: string;
      pincode?: string;
      status?: FarmStatus;
    }
  ): Promise<Farm & { farmer?: Farmer }>;
  delete(id: string): Promise<Farm>;
}
