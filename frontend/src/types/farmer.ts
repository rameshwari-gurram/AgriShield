export type LanguageCode = 'en' | 'hi' | 'mr' | 'te' | 'ta' | 'kn' | 'gu' | 'bn' | 'pa';

export interface LanguageOption {
  code: LanguageCode;
  name: string;
  nativeName: string;
}

export const SUPPORTED_LANGUAGES: LanguageOption[] = [
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिंदी' },
  { code: 'mr', name: 'Marathi', nativeName: 'मराठी' },
  { code: 'te', name: 'Telugu', nativeName: 'తెలుగు' },
  { code: 'ta', name: 'Tamil', nativeName: 'தமிழ்' },
  { code: 'kn', name: 'Kannada', nativeName: 'ಕನ್ನಡ' },
  { code: 'gu', name: 'Gujarati', nativeName: 'ગુજરાતી' },
  { code: 'bn', name: 'Bengali', nativeName: 'বাংলা' },
  { code: 'pa', name: 'Punjabi', nativeName: 'ਪੰਜਾਬੀ' },
];

export interface Farmer {
  id: string;
  fullName: string;
  mobileNumber: string;
  preferredLanguage: LanguageCode;
  farmerReferenceNumber: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateFarmerInput {
  fullName: string;
  mobileNumber: string;
  preferredLanguage: LanguageCode;
  farmerReferenceNumber?: string;
}

export interface FarmerListResponse {
  farmers: Farmer[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface FarmerQueryParams {
  page?: number;
  limit?: number;
  search?: string;
}
