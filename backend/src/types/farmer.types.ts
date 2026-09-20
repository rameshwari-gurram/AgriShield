import { Language, Farmer } from '@prisma/client';

export type SupportedLanguage = keyof typeof Language;

export interface CreateFarmerDTO {
  fullName: string;
  mobileNumber: string;
  preferredLanguage?: Language;
  farmerReferenceNumber?: string;
}

export interface FarmerResponseDTO {
  id: string;
  fullName: string;
  mobileNumber: string;
  preferredLanguage: Language;
  farmerReferenceNumber: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FarmerQueryDTO {
  page?: number;
  limit?: number;
  search?: string;
}

export interface FarmerListResponseDTO {
  farmers: FarmerResponseDTO[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface IFarmerRepository {
  create(data: {
    fullName: string;
    mobileNumber: string;
    preferredLanguage: Language;
    farmerReferenceNumber?: string | null;
  }): Promise<Farmer>;
  findById(id: string): Promise<Farmer | null>;
  findByMobileNumber(mobileNumber: string): Promise<Farmer | null>;
  findByReferenceNumber(ref: string): Promise<Farmer | null>;
  findAll(options: { skip: number; take: number; search?: string }): Promise<Farmer[]>;
  count(search?: string): Promise<number>;
}
